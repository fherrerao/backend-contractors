import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { assertContractorAccess } from '../auth/scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateWorkerDto, UpdateWorkerDto } from './dto/worker.dto.js';

const workerInclude = {
  projects: {
    include: {
      project: { select: { id: true, name: true, code: true, isActive: true } },
      documents: {
        include: { document: { select: { id: true, name: true } } },
      },
    },
  },
} as const;

@Injectable()
export class WorkersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByContractor(user: AuthUser, contractorId: string) {
    assertContractorAccess(user, contractorId);
    await this.assertContractorExists(contractorId);
    const workers = await this.prisma.worker.findMany({
      where: { contractorId },
      orderBy: { name: 'asc' },
      include: workerInclude,
    });
    return workers.map((w) => this.mapWorker(w));
  }

  async findOne(user: AuthUser, id: string) {
    const worker = await this.prisma.worker.findUnique({
      where: { id },
      include: workerInclude,
    });
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    assertContractorAccess(user, worker.contractorId);
    return this.mapWorker(worker);
  }

  async create(user: AuthUser, contractorId: string, dto: CreateWorkerDto) {
    assertContractorAccess(user, contractorId);
    await this.assertContractorExists(contractorId);
    await this.assertUniqueDocumentId(contractorId, dto.documentId);
    await this.validateProjectIds(contractorId, dto.projectIds);

    const { projectIds, ...data } = dto;
    const created = await this.prisma.worker.create({
      data: { ...data, contractorId },
    });
    await this.syncAssignments(created.id, projectIds);
    const worker = await this.prisma.worker.findUniqueOrThrow({
      where: { id: created.id },
      include: workerInclude,
    });
    return this.mapWorker(worker);
  }

  async update(user: AuthUser, id: string, dto: UpdateWorkerDto) {
    const current = await this.prisma.worker.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Trabajador no encontrado');
    assertContractorAccess(user, current.contractorId);
    if (dto.documentId && dto.documentId !== current.documentId) {
      await this.assertUniqueDocumentId(current.contractorId, dto.documentId);
    }
    if (dto.projectIds) {
      await this.validateProjectIds(current.contractorId, dto.projectIds);
    }

    const { projectIds, ...data } = dto;
    await this.prisma.worker.update({ where: { id }, data });
    if (projectIds) {
      await this.syncAssignments(id, projectIds);
    }
    const worker = await this.prisma.worker.findUniqueOrThrow({
      where: { id },
      include: workerInclude,
    });
    return this.mapWorker(worker);
  }

  private mapWorker(worker: {
    projects: Array<{
      project: { id: string; name: string; code: string | null; isActive: boolean };
      documents: Array<{ document: { id: string; name: string } }>;
    }>;
    [key: string]: unknown;
  }) {
    const { projects, ...rest } = worker;
    return {
      ...rest,
      projects: projects.map((pw) => ({
        ...pw.project,
        documents: pw.documents.map((d) => d.document),
      })),
    };
  }

  private async syncAssignments(workerId: string, projectIds: string[]) {
    await this.prisma.projectWorker.deleteMany({ where: { workerId } });
    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, documents: { select: { id: true } } },
    });
    const docsByProject = new Map(projects.map((p) => [p.id, p.documents]));

    for (const projectId of projectIds) {
      const docs = docsByProject.get(projectId) ?? [];
      if (!docs.length) {
        throw new BadRequestException(
          'Uno o mas proyectos no tienen documentos para asignar',
        );
      }
      await this.prisma.projectWorker.create({
        data: {
          projectId,
          workerId,
          documents: {
            create: docs.map((d) => ({ documentId: d.id })),
          },
        },
      });
    }
  }

  private async validateProjectIds(contractorId: string, projectIds: string[]) {
    if (new Set(projectIds).size !== projectIds.length) {
      throw new BadRequestException('No puedes asignar el mismo proyecto mas de una vez');
    }

    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds }, contractorId },
      select: { id: true },
    });
    if (projects.length !== projectIds.length) {
      throw new BadRequestException('Uno o mas proyectos no pertenecen a este contratista');
    }
  }

  private async assertContractorExists(contractorId: string) {
    const contractor = await this.prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!contractor) throw new NotFoundException('Contratista no encontrado');
  }

  private async assertUniqueDocumentId(contractorId: string, documentId: string) {
    const exists = await this.prisma.worker.findUnique({
      where: { contractorId_documentId: { contractorId, documentId } },
    });
    if (exists) throw new ConflictException('Ya existe un trabajador con esa cedula en este contratista');
  }
}
