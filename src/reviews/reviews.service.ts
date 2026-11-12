import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { mapDocument } from '../documents/documents.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewDocumentDto } from './dto/review.dto.js';
import { assertReviewable } from './review.rules.js';

const pendingInclude = {
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
} as const;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  findPending() {
    return this.prisma.document
      .findMany({
        where: { status: 'SUBMITTED', requirement: { isActive: true } },
        orderBy: { submittedAt: 'asc' },
        include: pendingInclude,
      })
      .then((docs) => docs.map((doc) => mapDocument(doc)));
  }

  countPending() {
    return this.prisma.document
      .count({ where: { status: 'SUBMITTED', requirement: { isActive: true } } })
      .then((count) => ({ count }));
  }

  async review(user: AuthUser, documentId: string, dto: ReviewDocumentDto) {
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.findUnique({ where: { id: documentId } });
      if (!document) throw new NotFoundException('Documento no encontrado');
      assertReviewable(document.status, dto.action, dto.comment);

      await tx.documentReview.create({
        data: {
          documentId,
          reviewerId: user.sub,
          action: dto.action,
          comment: dto.comment?.trim() || null,
          fileName: document.fileName,
        },
      });
      await tx.document.update({
        where: { id: documentId },
        data: { status: dto.action },
      });
      await this.compliance.recalculateWorker(document.workerId, tx);
      const updated = await tx.document.findUniqueOrThrow({
        where: { id: documentId },
        include: pendingInclude,
      });
      return mapDocument(updated);
    });
  }
}
