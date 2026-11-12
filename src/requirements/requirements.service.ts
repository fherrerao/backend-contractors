import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { assertContractorAccess } from '../auth/scope.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRequirementDto, UpdateRequirementDto } from './dto/requirement.dto.js';

@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  async findByContractor(user: AuthUser, contractorId: string) {
    assertContractorAccess(user, contractorId);
    await this.assertContractorExists(contractorId);
    return this.prisma.requirement.findMany({
      where: { contractorId },
      orderBy: { name: 'asc' },
    });
  }

  async create(user: AuthUser, contractorId: string, dto: CreateRequirementDto) {
    assertContractorAccess(user, contractorId);
    await this.assertContractorExists(contractorId);
    await this.assertUniqueName(contractorId, dto.name);

    const requirement = await this.prisma.requirement.create({
      data: {
        contractorId,
        name: dto.name.trim(),
      },
    });

    const workers = await this.prisma.worker.findMany({
      where: { contractorId, isActive: true },
      select: { id: true },
    });
    if (workers.length) {
      await this.prisma.document.createMany({
        data: workers.map((worker) => ({
          workerId: worker.id,
          requirementId: requirement.id,
        })),
        skipDuplicates: true,
      });
      for (const worker of workers) await this.compliance.recalculateWorker(worker.id);
    }

    return requirement;
  }

  async update(user: AuthUser, contractorId: string, id: string, dto: UpdateRequirementDto) {
    assertContractorAccess(user, contractorId);
    const current = await this.prisma.requirement.findUnique({ where: { id } });
    if (!current || current.contractorId !== contractorId) {
      throw new NotFoundException('Requisito no encontrado');
    }
    if (dto.name && dto.name.trim() !== current.name) {
      await this.assertUniqueName(contractorId, dto.name);
    }

    const requirement = await this.prisma.requirement.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    if (dto.isActive === true && !current.isActive) {
      const workers = await this.prisma.worker.findMany({
        where: { contractorId, isActive: true },
        select: { id: true },
      });
      if (workers.length) {
        await this.prisma.document.createMany({
          data: workers.map((worker) => ({ workerId: worker.id, requirementId: id })),
          skipDuplicates: true,
        });
      }
    }

    const workers = await this.prisma.worker.findMany({
      where: { contractorId },
      select: { id: true },
    });
    for (const worker of workers) await this.compliance.recalculateWorker(worker.id);
    return requirement;
  }

  private async assertContractorExists(contractorId: string) {
    const contractor = await this.prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!contractor) throw new NotFoundException('Contratista no encontrado');
  }

  private async assertUniqueName(contractorId: string, name: string) {
    const exists = await this.prisma.requirement.findUnique({
      where: { contractorId_name: { contractorId, name: name.trim() } },
    });
    if (exists) throw new ConflictException('Ya existe un requisito con ese nombre');
  }
}
