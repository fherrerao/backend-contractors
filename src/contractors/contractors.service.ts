import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { assertContractorAccess } from '../auth/scope.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ContractorQueryDto,
  CreateContractorDto,
  UpdateContractorDto,
} from './dto/contractor.dto.js';

@Injectable()
export class ContractorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  async findAll(user: AuthUser, query: ContractorQueryDto) {
    const where: Prisma.ContractorWhereInput = {
      status: query.status,
      ...(user.role === 'CONTRACTOR_USER' && { id: user.contractorId ?? '' }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { taxId: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const contractors = await this.prisma.contractor.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        documents: {
          where: { type: { isActive: true } },
          select: { status: true },
        },
      },
    });

    return contractors.map(({ documents, ...c }) => ({
      ...c,
      documentSummary: {
        total: documents.length,
        approved: documents.filter((d) => d.status === 'APPROVED').length,
        submitted: documents.filter((d) => d.status === 'SUBMITTED').length,
        rejected: documents.filter((d) => d.status === 'REJECTED').length,
      },
    }));
  }

  async findOne(user: AuthUser, id: string) {
    assertContractorAccess(user, id);
    const contractor = await this.prisma.contractor.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true, name: true, email: true, isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!contractor) throw new NotFoundException('Contratista no encontrado');
    return contractor;
  }

  async create(dto: CreateContractorDto) {
    await this.assertUniqueTaxId(dto.taxId);
    const contractor = await this.prisma.contractor.create({ data: dto });
    await this.compliance.ensureDocuments(contractor.id);
    await this.compliance.recalculate(contractor.id);
    return this.prisma.contractor.findUniqueOrThrow({ where: { id: contractor.id } });
  }

  async update(id: string, dto: UpdateContractorDto) {
    const current = await this.prisma.contractor.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Contratista no encontrado');
    if (dto.taxId && dto.taxId !== current.taxId) await this.assertUniqueTaxId(dto.taxId);
    return this.prisma.contractor.update({ where: { id }, data: dto });
  }

  private async assertUniqueTaxId(taxId: string) {
    if (await this.prisma.contractor.findUnique({ where: { taxId } })) {
      throw new ConflictException('Ya existe un contratista con ese NIT');
    }
  }
}
