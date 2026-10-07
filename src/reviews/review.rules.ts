import { BadRequestException } from '@nestjs/common';
import type { DocumentStatus, ReviewAction } from '../generated/prisma/enums.js';

export function assertReviewable(
  status: DocumentStatus,
  action: ReviewAction,
  comment?: string,
) {
  if (status !== 'SUBMITTED') {
    throw new BadRequestException('Solo se pueden revisar documentos en estado enviado');
  }
  if (action === 'REJECTED' && !comment?.trim()) {
    throw new BadRequestException('Debes indicar el motivo del rechazo');
  }
}
