import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth.types.js';
import { assertContractorAccess } from '../auth/scope.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';

export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export interface UploadedFileData {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const reviewSelect = {
  id: true,
  action: true,
  comment: true,
  fileName: true,
  createdAt: true,
  reviewer: { select: { id: true, name: true } },
} as const;

@Injectable()
export class DocumentsService {
  private readonly maxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly compliance: ComplianceService,
    config: ConfigService,
  ) {
    this.maxBytes = Number(config.get('MAX_UPLOAD_MB', 10)) * 1024 * 1024;
  }

  async findByContractor(user: AuthUser, contractorId: string) {
    assertContractorAccess(user, contractorId);
    const contractor = await this.prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!contractor) throw new NotFoundException('Contratista no encontrado');

    await this.compliance.ensureDocuments(contractorId);
    return this.prisma.document.findMany({
      where: { contractorId, type: { isActive: true } },
      orderBy: [{ type: { required: 'desc' } }, { type: { name: 'asc' } }],
      include: {
        type: true,
        uploadedBy: { select: { id: true, name: true } },
        reviews: { orderBy: { createdAt: 'desc' }, take: 1, select: reviewSelect },
      },
    });
  }

  async upload(
    user: AuthUser,
    contractorId: string,
    typeId: string,
    file: UploadedFileData | undefined,
    dto: UploadDocumentDto,
  ) {
    assertContractorAccess(user, contractorId);
    if (!file) throw new BadRequestException('Debes adjuntar un archivo');
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato no permitido. Usa PDF, JPG o PNG');
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `El archivo supera el tamano maximo de ${this.maxBytes / 1024 / 1024} MB`,
      );
    }

    const [contractor, type] = await Promise.all([
      this.prisma.contractor.findUnique({ where: { id: contractorId } }),
      this.prisma.documentType.findUnique({ where: { id: typeId } }),
    ]);
    if (!contractor) throw new NotFoundException('Contratista no encontrado');
    if (!type || !type.isActive) throw new NotFoundException('Tipo de documento no encontrado');

    let expiresAt: Date | null = null;
    if (type.expires) {
      if (!dto.expiresAt) {
        throw new BadRequestException('Este documento requiere fecha de vencimiento');
      }
      expiresAt = new Date(dto.expiresAt);
      if (expiresAt <= new Date()) {
        throw new BadRequestException('La fecha de vencimiento debe ser futura');
      }
    }

    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const previous = await this.prisma.document.findUnique({
      where: { contractorId_typeId: { contractorId, typeId } },
    });
    const filePath = await this.storage.save(file.buffer, fileName);

    const data = {
      status: 'SUBMITTED' as const,
      filePath,
      fileName,
      mimeType: file.mimetype,
      size: file.size,
      expiresAt,
      submittedAt: new Date(),
      uploadedById: user.sub,
    };
    const document = await this.prisma.document.upsert({
      where: { contractorId_typeId: { contractorId, typeId } },
      create: { contractorId, typeId, ...data },
      update: data,
      include: { type: true },
    });

    if (previous?.filePath) await this.storage.delete(previous.filePath);
    await this.compliance.recalculate(contractorId);
    return document;
  }

  async getFile(user: AuthUser, id: string) {
    const document = await this.findAccessible(user, id);
    if (!document.filePath) throw new NotFoundException('El documento no tiene archivo');
    return {
      stream: this.storage.getStream(document.filePath),
      fileName: document.fileName ?? 'documento',
      mimeType: document.mimeType ?? 'application/octet-stream',
    };
  }

  async getReviews(user: AuthUser, id: string) {
    await this.findAccessible(user, id);
    return this.prisma.documentReview.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'desc' },
      select: reviewSelect,
    });
  }

  private async findAccessible(user: AuthUser, id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException('Documento no encontrado');
    assertContractorAccess(user, document.contractorId);
    return document;
  }
}
