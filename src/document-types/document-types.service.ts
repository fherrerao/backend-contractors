import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceService } from '../compliance/compliance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from './dto/document-type.dto.js';

@Injectable()
export class DocumentTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  findAll(includeInactive: boolean) {
    return this.prisma.documentType.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateDocumentTypeDto) {
    await this.assertUniqueName(dto.name);
    const type = await this.prisma.documentType.create({ data: dto });
    await this.syncContractors();
    return type;
  }

  async update(id: string, dto: UpdateDocumentTypeDto) {
    const current = await this.prisma.documentType.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Tipo de documento no encontrado');
    if (dto.name && dto.name !== current.name) await this.assertUniqueName(dto.name);

    const type = await this.prisma.documentType.update({ where: { id }, data: dto });
    if (
      dto.isActive !== undefined && dto.isActive !== current.isActive ||
      dto.required !== undefined && dto.required !== current.required
    ) {
      await this.syncContractors();
    }
    return type;
  }

  private async syncContractors() {
    await this.compliance.ensureDocuments();
    await this.compliance.recalculateAll();
  }

  private async assertUniqueName(name: string) {
    if (await this.prisma.documentType.findUnique({ where: { name } })) {
      throw new ConflictException('Ya existe un tipo de documento con ese nombre');
    }
  }
}
