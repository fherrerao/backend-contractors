import {
  BadRequestException,
  ConflictException,
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
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto.js';
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

  async findByProject(user: AuthUser, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    assertContractorAccess(user, project.contractorId);

    return this.prisma.document.findMany({
      where: { projectId },
      orderBy: [{ required: 'desc' }, { name: 'asc' }],
      include: {
        uploadedBy: { select: { id: true, name: true } },
        reviews: { orderBy: { createdAt: 'desc' }, take: 1, select: reviewSelect },
      },
    });
  }

  async create(user: AuthUser, projectId: string, dto: CreateDocumentDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    assertContractorAccess(user, project.contractorId);
    await this.assertUniqueName(projectId, dto.name);

    const document = await this.prisma.document.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        required: dto.required ?? true,
        expires: dto.expires ?? false,
      },
    });

    const links = await this.prisma.projectWorker.findMany({
      where: { projectId },
      select: { id: true },
    });
    if (links.length) {
      await this.prisma.projectWorkerDocument.createMany({
        data: links.map((link) => ({
          projectWorkerId: link.id,
          documentId: document.id,
        })),
        skipDuplicates: true,
      });
    }

    await this.compliance.recalculateProject(projectId);
    return document;
  }

  async update(user: AuthUser, id: string, dto: UpdateDocumentDto) {
    const current = await this.findAccessible(user, id);
    if (dto.name && dto.name !== current.name) {
      await this.assertUniqueName(current.projectId, dto.name);
    }
    const document = await this.prisma.document.update({
      where: { id },
      data: dto,
    });
    if (dto.required !== undefined && dto.required !== current.required) {
      await this.compliance.recalculateProject(current.projectId);
    }
    return document;
  }

  async upload(
    user: AuthUser,
    projectId: string,
    documentId: string,
    file: UploadedFileData | undefined,
    dto: UploadDocumentDto,
  ) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    assertContractorAccess(user, project.contractorId);

    if (!file) throw new BadRequestException('Debes adjuntar un archivo');
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato no permitido. Usa PDF, JPG o PNG');
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `El archivo supera el tamano maximo de ${this.maxBytes / 1024 / 1024} MB`,
      );
    }

    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.projectId !== projectId) {
      throw new NotFoundException('Documento no encontrado');
    }

    let expiresAt: Date | null = null;
    if (document.expires) {
      if (!dto.expiresAt) {
        throw new BadRequestException('Este documento requiere fecha de vencimiento');
      }
      expiresAt = new Date(dto.expiresAt);
      if (expiresAt <= new Date()) {
        throw new BadRequestException('La fecha de vencimiento debe ser futura');
      }
    }

    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const filePath = await this.storage.save(file.buffer, fileName);
    const previousPath = document.filePath;

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'SUBMITTED',
        filePath,
        fileName,
        mimeType: file.mimetype,
        size: file.size,
        expiresAt,
        submittedAt: new Date(),
        uploadedById: user.sub,
      },
    });

    if (previousPath) await this.storage.delete(previousPath);
    await this.compliance.recalculateProject(projectId);
    return updated;
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
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { project: { select: { contractorId: true } } },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    assertContractorAccess(user, document.project.contractorId);
    return document;
  }

  private async assertUniqueName(projectId: string, name: string) {
    const exists = await this.prisma.document.findUnique({
      where: { projectId_name: { projectId, name } },
    });
    if (exists) throw new ConflictException('Ya existe un documento con ese nombre en el proyecto');
  }
}
