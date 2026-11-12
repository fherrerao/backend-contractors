import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { assertContractorAccess } from '../auth/scope.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateWorkerDto, UpdateWorkerDto } from './dto/worker.dto.js';

const workerInclude = {
  projects: {
    include: {
      project: { select: { id: true, name: true, code: true, isActive: true } },
    },
  },
} as const;

@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  async findByContractor(user: AuthUser, contractorId: string) {
    assertContractorAccess(user, contractorId);
    await this.assertContractorExists(contractorId);
    const workers = await this.prisma.worker.findMany({
      where: { contractorId },
      orderBy: { name: 'asc' },
      include: workerInclude,
    });
    return workers.map((worker) => this.mapWorker(worker));
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

    const created = await this.prisma.worker.create({
      data: { ...dto, contractorId },
    });
    await this.ensureDocuments(created.id, contractorId);
    await this.compliance.recalculateWorker(created.id);

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

    await this.prisma.worker.update({ where: { id }, data: dto });
    if (dto.isActive === true && !current.isActive) {
      await this.ensureDocuments(id, current.contractorId);
    }
    await this.compliance.recalculateWorker(id);

    const worker = await this.prisma.worker.findUniqueOrThrow({
      where: { id },
      include: workerInclude,
    });
    return this.mapWorker(worker);
  }

  private async ensureDocuments(workerId: string, contractorId: string) {
    const requirements = await this.prisma.requirement.findMany({
      where: { contractorId, isActive: true, projectDocuments: { some: {} } },
      select: { id: true },
    });
    if (!requirements.length) return;
    await this.prisma.document.createMany({
      data: requirements.map((requirement) => ({
        workerId,
        requirementId: requirement.id,
      })),
      skipDuplicates: true,
    });
  }

  private mapWorker(worker: {
    projects: Array<{
      project: { id: string; name: string; code: string | null; isActive: boolean };
    }>;
    [key: string]: unknown;
  }) {
    const { projects, ...rest } = worker;
    return {
      ...rest,
      projects: projects.map((link) => link.project),
    };
  }

  private async assertContractorExists(contractorId: string) {
    const contractor = await this.prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!contractor) throw new NotFoundException('Contratista no encontrado');
  }

  private async assertUniqueDocumentId(contractorId: string, documentId: string) {
    const exists = await this.prisma.worker.findUnique({
      where: { contractorId_documentId: { contractorId, documentId } },
    });
    if (exists) {
      throw new ConflictException('Ya existe un trabajador con esa cedula en este contratista');
    }
  }
}
