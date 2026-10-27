import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { assertContractorAccess } from '../auth/scope.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateProjectDto,
  ProjectDocumentInputDto,
  UpdateProjectDto,
} from './dto/project.dto.js';

const workerSelect = {
  id: true,
  name: true,
  documentId: true,
  position: true,
  phone: true,
  email: true,
  isActive: true,
} as const;

const documentSelect = {
  id: true,
  name: true,
  description: true,
  required: true,
  expires: true,
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
    return this.prisma.project
      .findMany({
        where: { contractorId },
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { workers: true, documents: true } },
          documents: {
            select: documentSelect,
            orderBy: { name: 'asc' },
          },
        },
      })
      .then((projects) =>
        projects.map(({ documents, _count, ...p }) => ({
          ...p,
          workerCount: _count.workers,
          documents,
          documentSummary: {
            total: documents.length,
            approved: documents.filter((d) => d.status === 'APPROVED').length,
            submitted: documents.filter((d) => d.status === 'SUBMITTED').length,
            rejected: documents.filter((d) => d.status === 'REJECTED').length,
          },
        })),
      );
  }

  async findOne(user: AuthUser, id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        contractor: { select: { id: true, name: true, taxId: true } },
        documents: {
          select: documentSelect,
          orderBy: { name: 'asc' },
        },
        workers: {
          include: {
            worker: { select: workerSelect },
            documents: {
              include: { document: { select: { id: true, name: true } } },
            },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    assertContractorAccess(user, project.contractorId);
    const { workers, ...rest } = project;
    return {
      ...rest,
      workers: workers.map((pw) => ({
        ...pw.worker,
        assignedAt: pw.assignedAt,
        documents: pw.documents.map((d) => d.document),
      })),
    };
  }

  async create(user: AuthUser, contractorId: string, dto: CreateProjectDto) {
    assertContractorAccess(user, contractorId);
    await this.assertContractorExists(contractorId);
    this.assertUniqueDocumentNames(dto.documents);

    const { documents, ...data } = dto;
    const project = await this.prisma.project.create({
      data: {
        ...data,
        contractorId,
        documents: {
          create: documents.map((d) => ({
            name: d.name,
            description: d.description,
            required: d.required ?? true,
            expires: d.expires ?? false,
          })),
        },
      },
    });
    await this.compliance.recalculateProject(project.id);
    return this.findOne(user, project.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateProjectDto) {
    const current = await this.prisma.project.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Proyecto no encontrado');
    assertContractorAccess(user, current.contractorId);

    const { documents, ...data } = dto;
    if (documents) this.assertUniqueDocumentNames(documents);

    await this.prisma.project.update({ where: { id }, data });
    if (documents) {
      await this.syncDocuments(id, documents);
    }
    if (dto.isActive !== undefined && dto.isActive !== current.isActive) {
      await this.compliance.recalculateContractor(current.contractorId);
    } else if (documents) {
      await this.compliance.recalculateProject(id);
    }
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

    const existing = await this.prisma.projectWorker.findUnique({
      where: { projectId_workerId: { projectId, workerId } },
    });
    if (existing) {
      throw new ConflictException('El trabajador ya esta asignado a este proyecto');
    }

    const projectDocs = await this.prisma.document.findMany({
      where: { projectId },
      select: { id: true },
    });
    if (!projectDocs.length) {
      throw new BadRequestException('El proyecto no tiene documentos para asignar');
    }

    await this.prisma.projectWorker.create({
      data: {
        projectId,
        workerId,
        documents: {
          create: projectDocs.map((d) => ({ documentId: d.id })),
        },
      },
    });
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
    return this.findOne(user, projectId);
  }

  private async syncDocuments(projectId: string, documents: ProjectDocumentInputDto[]) {
    const existing = await this.prisma.document.findMany({
      where: { projectId },
      select: { id: true, filePath: true },
    });
    const existingById = new Map(existing.map((d) => [d.id, d]));
    const keptIds = new Set<string>();
    const createdIds: string[] = [];

    for (const doc of documents) {
      if (doc.id) {
        if (!existingById.has(doc.id)) {
          throw new BadRequestException('Uno o mas documentos no pertenecen a este proyecto');
        }
        keptIds.add(doc.id);
        await this.prisma.document.update({
          where: { id: doc.id },
          data: {
            name: doc.name,
            description: doc.description,
            required: doc.required ?? true,
            expires: doc.expires ?? false,
          },
        });
      } else {
        const created = await this.prisma.document.create({
          data: {
            projectId,
            name: doc.name,
            description: doc.description,
            required: doc.required ?? true,
            expires: doc.expires ?? false,
          },
        });
        createdIds.push(created.id);
        keptIds.add(created.id);
      }
    }

    for (const doc of existing) {
      if (keptIds.has(doc.id)) continue;
      if (!doc.filePath) {
        await this.prisma.document.delete({ where: { id: doc.id } });
      }
    }

    if (createdIds.length) {
      await this.assignNewDocumentsToWorkers(projectId, createdIds);
    }
  }

  private async assignNewDocumentsToWorkers(projectId: string, documentIds: string[]) {
    const links = await this.prisma.projectWorker.findMany({
      where: { projectId },
      select: { id: true },
    });
    if (!links.length) return;
    await this.prisma.projectWorkerDocument.createMany({
      data: links.flatMap((link) =>
        documentIds.map((documentId) => ({
          projectWorkerId: link.id,
          documentId,
        })),
      ),
      skipDuplicates: true,
    });
  }

  private assertUniqueDocumentNames(documents: ProjectDocumentInputDto[]) {
    const names = documents.map((d) => d.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Hay nombres de documento duplicados en el proyecto');
    }
  }

  private async assertContractorExists(contractorId: string) {
    const contractor = await this.prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!contractor) throw new NotFoundException('Contratista no encontrado');
  }
}
