import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewDocumentDto } from './dto/review.dto.js';
import { assertReviewable } from './review.rules.js';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  findPending() {
    return this.prisma.document.findMany({
      where: { status: 'SUBMITTED', type: { isActive: true } },
      orderBy: { submittedAt: 'asc' },
      include: {
        type: true,
        contractor: { select: { id: true, name: true, taxId: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }

  countPending() {
    return this.prisma.document
      .count({ where: { status: 'SUBMITTED', type: { isActive: true } } })
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
      const updated = await tx.document.update({
        where: { id: documentId },
        data: { status: dto.action },
        include: { type: true },
      });
      await this.compliance.recalculate(document.contractorId, tx);
      return updated;
    });
  }
}
