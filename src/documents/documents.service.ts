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
import { AddWorkerDocumentDto } from './dto/add-worker-document.dto.js';
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

const documentInclude = {
  requirement: {
    select: {
      id: true,
      name: true,
      isActive: true,
      projectDocuments: { select: { description: true, required: true, expires: true } },
    },
  },
  uploadedBy: { select: { id: true, name: true } },
  worker: {
    select: {
      id: true,
      name: true,
      documentId: true,
      contractor: { select: { id: true, name: true, taxId: true } },
    },
  },
  reviews: { orderBy: { createdAt: 'desc' as const }, take: 1, select: reviewSelect },
};

type DocumentWithRelations = {
  id: string;
  workerId: string;
  requirementId: string;
  status: string;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  expiresAt: Date | null;
  submittedAt: Date | null;
  requirement: {
    name: string;
    projectDocuments: Array<{ description: string | null; required: boolean; expires: boolean }>;
  };
  uploadedBy: { id: string; name: string } | null;
  worker: {
    id: string;
    name: string;
    documentId: string;
    contractor: { id: string; name: string; taxId: string };
  };
  reviews?: Array<{
    id: string;
    action: string;
    comment: string | null;
    fileName: string | null;
    createdAt: Date;
    reviewer: { id: string; name: string };
  }>;
};

export function mapDocument(
  doc: DocumentWithRelations,
  options?: { nonRemovableRequirementIds?: Set<string> },
) {
  const { requirement, worker, ...rest } = doc;
  const links = requirement.projectDocuments;
  return {
    ...rest,
    name: requirement.name,
    description: links.find((link) => link.description)?.description ?? null,
    required: links.some((link) => link.required),
    expires: links.some((link) => link.expires),
    workerOnly: links.length === 0,
    removable: !options?.nonRemovableRequirementIds?.has(doc.requirementId),
    worker: { id: worker.id, name: worker.name, documentId: worker.documentId },
    contractor: worker.contractor,
  };
}

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

  async findByWorker(user: AuthUser, workerId: string) {
    const worker = await this.prisma.worker.findUnique({ where: { id: workerId } });
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    assertContractorAccess(user, worker.contractorId);

    const documents = await this.prisma.document.findMany({
      where: { workerId, requirement: { isActive: true } },
      orderBy: { requirement: { name: 'asc' } },
      include: documentInclude,
    });
    const nonRemovable = await this.nonRemovableRequirementIds(workerId);
    return documents
      .map((doc) => mapDocument(doc, { nonRemovableRequirementIds: nonRemovable }))
      .sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name, 'es'));
  }

  async addToWorker(user: AuthUser, workerId: string, dto: AddWorkerDocumentDto) {
    const worker = await this.prisma.worker.findUnique({ where: { id: workerId } });
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    assertContractorAccess(user, worker.contractorId);

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: dto.requirementId },
      include: { projectDocuments: { select: { id: true } } },
    });
    if (!requirement || requirement.contractorId !== worker.contractorId) {
      throw new NotFoundException('Tipo de documento no encontrado');
    }
    if (!requirement.projectDocuments.length) {
      throw new BadRequestException('El documento debe estar definido en un proyecto');
    }
    if (!requirement.isActive) {
      await this.prisma.requirement.update({
        where: { id: requirement.id },
        data: { isActive: true },
      });
    }

    const existing = await this.prisma.document.findUnique({
      where: { workerId_requirementId: { workerId, requirementId: requirement.id } },
    });
    if (existing) {
      throw new ConflictException('Este trabajador ya tiene ese tipo de documento');
    }

    const created = await this.prisma.document.create({
      data: { workerId, requirementId: requirement.id },
      include: documentInclude,
    });
    await this.compliance.recalculateWorker(workerId);
    const nonRemovable = await this.nonRemovableRequirementIds(workerId);
    return mapDocument(created, { nonRemovableRequirementIds: nonRemovable });
  }

  async removeFromWorker(user: AuthUser, workerId: string, documentId: string) {
    const worker = await this.prisma.worker.findUnique({ where: { id: workerId } });
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    assertContractorAccess(user, worker.contractorId);

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, workerId: true, requirementId: true, filePath: true },
    });
    if (!document || document.workerId !== workerId) {
      throw new NotFoundException('Documento no encontrado');
    }

    const nonRemovable = await this.nonRemovableRequirementIds(workerId);
    if (nonRemovable.has(document.requirementId)) {
      throw new BadRequestException(
        'No se puede eliminar: el documento es obligatorio en un proyecto asignado',
      );
    }

    if (document.filePath) await this.storage.delete(document.filePath);
    await this.prisma.document.delete({ where: { id: documentId } });

    const [remainingDocs, projectLinks] = await Promise.all([
      this.prisma.document.count({ where: { requirementId: document.requirementId } }),
      this.prisma.projectDocument.count({ where: { requirementId: document.requirementId } }),
    ]);
    if (remainingDocs === 0 && projectLinks === 0) {
      await this.prisma.requirement.update({
        where: { id: document.requirementId },
        data: { isActive: false },
      });
    }

    await this.compliance.recalculateWorker(workerId);
  }

  async upload(
    user: AuthUser,
    workerId: string,
    documentId: string,
    file: UploadedFileData | undefined,
    dto: UploadDocumentDto,
  ) {
    const worker = await this.prisma.worker.findUnique({ where: { id: workerId } });
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    assertContractorAccess(user, worker.contractorId);

    if (!file) throw new BadRequestException('Debes adjuntar un archivo');
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato no permitido. Usa PDF, JPG o PNG');
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `El archivo supera el tamano maximo de ${this.maxBytes / 1024 / 1024} MB`,
      );
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        requirement: {
          select: {
            isActive: true,
            projectDocuments: { select: { expires: true } },
          },
        },
      },
    });
    if (!document || document.workerId !== workerId || !document.requirement.isActive) {
      throw new NotFoundException('Documento no encontrado');
    }

    let expiresAt: Date | null = null;
    if (document.requirement.projectDocuments.some((link) => link.expires)) {
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
      include: documentInclude,
    });

    if (previousPath) await this.storage.delete(previousPath);
    await this.compliance.recalculateWorker(workerId);
    const nonRemovable = await this.nonRemovableRequirementIds(workerId);
    return mapDocument(updated, { nonRemovableRequirementIds: nonRemovable });
  }

  async getFile(user: AuthUser, id: string) {
    const document = await this.findAccessible(user, id);
    if (!document.filePath) throw new NotFoundException('El documento no tiene archivo');
    return {
      stream: await this.storage.getStream(document.filePath),
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

  private async nonRemovableRequirementIds(workerId: string): Promise<Set<string>> {
    const assignments = await this.prisma.projectWorker.findMany({
      where: { workerId },
      select: { projectId: true },
    });
    const projectIds = assignments.map((link) => link.projectId);
    if (!projectIds.length) return new Set();

    const requiredLinks = await this.prisma.projectDocument.findMany({
      where: { projectId: { in: projectIds }, required: true },
      select: { requirementId: true },
    });
    return new Set(requiredLinks.map((link) => link.requirementId));
  }

  private async findAccessible(user: AuthUser, id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { worker: { select: { contractorId: true } } },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    assertContractorAccess(user, document.worker.contractorId);
    return document;
  }
}
