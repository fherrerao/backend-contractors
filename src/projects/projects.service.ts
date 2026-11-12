import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { assertContractorAccess } from '../auth/scope.js';
import {
  ComplianceService,
  type ProjectDocRule,
  statusForRules,
} from '../compliance/compliance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectDto, ProjectDocumentInput, UpdateProjectDto } from './dto/project.dto.js';

const workerSelect = {
  id: true,
  name: true,
  documentId: true,
  position: true,
  phone: true,
  email: true,
  isActive: true,
  status: true,
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  async findByContractor(user: AuthUser, contractorId: string) {
    assertContractorAccess(user, contractorId);
    await this.assertContractorExists(contractorId);
    const projects = await this.prisma.project.findMany({
      where: { contractorId },
      orderBy: { name: 'asc' },
      include: {
        projectDocuments: {
          where: { requirement: { isActive: true } },
          include: { requirement: { select: { id: true, name: true } } },
          orderBy: { requirement: { name: 'asc' } },
        },
        workers: {
          select: {
            worker: {
              select: {
                isActive: true,
                documents: { select: { id: true, requirementId: true, status: true, expiresAt: true } },
              },
            },
          },
        },
      },
    });
    return projects.map(({ workers, projectDocuments, ...project }) => {
      const rules = projectDocuments.map((link) => ({
        requirementId: link.requirementId,
        required: link.required,
        expires: link.expires,
      }));
      const active = workers.filter((link) => link.worker.isActive);
      return {
        ...project,
        documents: projectDocuments.map((link) => this.mapProjectDocument(link)),
        workerCount: workers.length,
        compliantWorkerCount: active.filter(
          (link) => statusForRules(rules, link.worker.documents) === 'COMPLIANT',
        ).length,
      };
    });
  }

  async findOne(user: AuthUser, id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        contractor: { select: { id: true, name: true, taxId: true } },
        projectDocuments: {
          where: { requirement: { isActive: true } },
          include: { requirement: { select: { id: true, name: true } } },
          orderBy: { requirement: { name: 'asc' } },
        },
        workers: {
          include: { worker: { select: workerSelect } },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    assertContractorAccess(user, project.contractorId);
    const rules = project.projectDocuments.map((link) => ({
      requirementId: link.requirementId,
      required: link.required,
      expires: link.expires,
    }));
    const reqIds = rules.map((rule) => rule.requirementId);
    const assignedWorkerIds = project.workers.map((link) => link.worker.id);
    const docsForProject =
      assignedWorkerIds.length && reqIds.length
        ? await this.prisma.document.findMany({
            where: {
              workerId: { in: assignedWorkerIds },
              requirementId: { in: reqIds },
            },
            select: { workerId: true, id: true, requirementId: true, status: true, expiresAt: true },
          })
        : [];
    const workerDocs = new Map<string, Array<{ id: string; requirementId: string; status: string; expiresAt: Date | null }>>();
    for (const row of docsForProject) {
      const { workerId, ...file } = row;
      const list = workerDocs.get(workerId) ?? [];
      list.push(file);
      workerDocs.set(workerId, list);
    }
    const eligibleWorkerIds = await this.computeEligibleWorkerIds(project.contractorId, rules);
    const { workers, projectDocuments, ...rest } = project;
    return {
      ...rest,
      documents: projectDocuments.map((link) => this.mapProjectDocument(link)),
      eligibleWorkerIds,
      workers: workers.map((link) => ({
        ...link.worker,
        status: statusForRules(rules, workerDocs.get(link.worker.id) ?? []),
        assignedAt: link.assignedAt,
      })),
    };
  }

  async create(user: AuthUser, contractorId: string, dto: CreateProjectDto) {
    assertContractorAccess(user, contractorId);
    await this.assertContractorExists(contractorId);
    this.assertDocumentList(dto.documents);
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description,
          code: dto.code,
          contractorId,
        },
      });
      await this.syncDocuments(tx, contractorId, created.id, dto.documents);
      return created;
    });
    await this.recalculateCompany(contractorId, project.id);
    return this.findOne(user, project.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateProjectDto) {
    const current = await this.prisma.project.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Proyecto no encontrado');
    assertContractorAccess(user, current.contractorId);
    if (dto.documents) this.assertDocumentList(dto.documents);

    const { documents, ...data } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data });
      if (documents) await this.syncDocuments(tx, current.contractorId, id, documents);
    });
    await this.recalculateCompany(current.contractorId, id);
    return this.findOne(user, id);
  }

  async assignWorker(user: AuthUser, projectId: string, workerId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    assertContractorAccess(user, project.contractorId);

    const worker = await this.prisma.worker.findUnique({ where: { id: workerId } });
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    if (worker.contractorId !== project.contractorId) {
      throw new BadRequestException('El trabajador no pertenece al mismo contratista');
    }
    if (!worker.isActive) {
      throw new BadRequestException('El trabajador esta inactivo');
    }

    const existing = await this.prisma.projectWorker.findUnique({
      where: { projectId_workerId: { projectId, workerId } },
    });
    if (existing) {
      throw new ConflictException('El trabajador ya esta asignado a este proyecto');
    }

    await this.assertWorkerEligibleForProject(projectId, workerId);

    await this.prisma.projectWorker.create({ data: { projectId, workerId } });
    await this.compliance.recalculateProject(projectId);
    return this.findOne(user, projectId);
  }

  async unassignWorker(user: AuthUser, projectId: string, workerId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    assertContractorAccess(user, project.contractorId);

    const link = await this.prisma.projectWorker.findUnique({
      where: { projectId_workerId: { projectId, workerId } },
    });
    if (!link) throw new NotFoundException('El trabajador no esta asignado a este proyecto');

    await this.prisma.projectWorker.delete({ where: { id: link.id } });
    await this.compliance.recalculateProject(projectId);
    return this.findOne(user, projectId);
  }

  private assertDocumentList(documents: ProjectDocumentInput[]) {
    const names = documents.map((doc) => doc.name.trim().toLowerCase());
    if (names.some((name) => name.length < 2)) {
      throw new BadRequestException('Cada documento necesita un nombre');
    }
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Hay documentos repetidos en el proyecto');
    }
  }

  private async syncDocuments(
    tx: Pick<PrismaService, 'requirement' | 'projectDocument' | 'document' | 'worker'>,
    contractorId: string,
    projectId: string,
    documents: ProjectDocumentInput[],
  ) {
    const current = await tx.projectDocument.findMany({
      where: { projectId },
      select: { id: true, requirementId: true },
    });
    const kept: string[] = [];

    for (const doc of documents) {
      const name = doc.name.trim();
      let requirement = await tx.requirement.findUnique({
        where: { contractorId_name: { contractorId, name } },
      });
      if (!requirement) {
        requirement = await tx.requirement.create({
          data: { contractorId, name, isActive: true },
        });
      } else if (!requirement.isActive) {
        requirement = await tx.requirement.update({
          where: { id: requirement.id },
          data: { isActive: true },
        });
      }
      kept.push(requirement.id);
      await tx.projectDocument.upsert({
        where: { projectId_requirementId: { projectId, requirementId: requirement.id } },
        create: {
          projectId,
          requirementId: requirement.id,
          description: doc.description?.trim() || null,
          required: doc.required ?? true,
          expires: doc.expires ?? false,
        },
        update: {
          description: doc.description?.trim() || null,
          required: doc.required ?? true,
          expires: doc.expires ?? false,
        },
      });
    }

    const removed = current.filter((link) => !kept.includes(link.requirementId));
    if (removed.length) {
      await tx.projectDocument.deleteMany({ where: { id: { in: removed.map((link) => link.id) } } });
    }

    const touched = [...new Set([...current.map((link) => link.requirementId), ...kept])];
    if (touched.length) {
      await tx.requirement.updateMany({
        where: { id: { in: touched }, projectDocuments: { none: {} } },
        data: { isActive: false },
      });
    }

    const workers = await tx.worker.findMany({
      where: { contractorId, isActive: true },
      select: { id: true },
    });
    if (workers.length && kept.length) {
      await tx.document.createMany({
        data: workers.flatMap((worker) =>
          kept.map((requirementId) => ({ workerId: worker.id, requirementId })),
        ),
        skipDuplicates: true,
      });
    }
  }

  private async recalculateCompany(contractorId: string, projectId: string) {
    const workers = await this.prisma.worker.findMany({
      where: { contractorId, isActive: true },
      select: { id: true },
    });
    for (const worker of workers) await this.compliance.recalculateWorker(worker.id);
    await this.compliance.recalculateProject(projectId);
  }

  private mapProjectDocument(link: {
    id: string;
    description: string | null;
    required: boolean;
    expires: boolean;
    requirementId: string;
    requirement: { name: string };
  }) {
    return {
      id: link.id,
      requirementId: link.requirementId,
      name: link.requirement.name,
      description: link.description,
      required: link.required,
      expires: link.expires,
    };
  }

  private async assertContractorExists(contractorId: string) {
    const contractor = await this.prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!contractor) throw new NotFoundException('Contratista no encontrado');
  }

  private hasRequiredRules(rules: ProjectDocRule[]) {
    return rules.some((rule) => rule.required);
  }

  private async getProjectRules(projectId: string): Promise<ProjectDocRule[]> {
    const links = await this.prisma.projectDocument.findMany({
      where: { projectId, requirement: { isActive: true } },
      select: { requirementId: true, required: true, expires: true },
    });
    return links.map((link) => ({
      requirementId: link.requirementId,
      required: link.required,
      expires: link.expires,
    }));
  }

  private async assertWorkerEligibleForProject(projectId: string, workerId: string) {
    const rules = await this.getProjectRules(projectId);
    if (!this.hasRequiredRules(rules)) {
      throw new BadRequestException(
        'El proyecto debe tener al menos un documento obligatorio para asignar trabajadores',
      );
    }
    const reqIds = rules.map((rule) => rule.requirementId);
    const docs = await this.prisma.document.findMany({
      where: { workerId, requirementId: { in: reqIds } },
      select: { id: true, requirementId: true, status: true, expiresAt: true },
    });
    const status = statusForRules(rules, docs);
    if (status !== 'COMPLIANT') {
      throw new BadRequestException(
        'El trabajador no cumple con los documentos obligatorios de este proyecto',
      );
    }
  }

  private async computeEligibleWorkerIds(
    contractorId: string,
    rules: ProjectDocRule[],
  ): Promise<string[]> {
    if (!this.hasRequiredRules(rules)) return [];

    const activeWorkers = await this.prisma.worker.findMany({
      where: { contractorId, isActive: true },
      select: { id: true },
    });
    if (!activeWorkers.length) return [];

    const workerIds = activeWorkers.map((worker) => worker.id);
    const reqIds = rules.map((rule) => rule.requirementId);
    const rows = await this.prisma.document.findMany({
      where: { workerId: { in: workerIds }, requirementId: { in: reqIds } },
      select: { workerId: true, id: true, requirementId: true, status: true, expiresAt: true },
    });
    const workerDocs = new Map<
      string,
      Array<{ id: string; requirementId: string; status: string; expiresAt: Date | null }>
    >();
    for (const row of rows) {
      const { workerId, ...file } = row;
      const list = workerDocs.get(workerId) ?? [];
      list.push(file);
      workerDocs.set(workerId, list);
    }

    return workerIds.filter(
      (id) => statusForRules(rules, workerDocs.get(id) ?? []) === 'COMPLIANT',
    );
  }
}
