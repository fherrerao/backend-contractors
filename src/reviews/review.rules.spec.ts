import { BadRequestException } from '@nestjs/common';
import { assertReviewable } from './review.rules.js';

describe('assertReviewable', () => {
  it('permite aprobar un documento enviado sin comentario', () => {
    expect(() => assertReviewable('SUBMITTED', 'APPROVED')).not.toThrow();
  });

  it('permite rechazar un documento enviado con comentario', () => {
    expect(() => assertReviewable('SUBMITTED', 'REJECTED', 'Ilegible')).not.toThrow();
  });

  it('exige comentario al rechazar', () => {
    expect(() => assertReviewable('SUBMITTED', 'REJECTED')).toThrow(BadRequestException);
    expect(() => assertReviewable('SUBMITTED', 'REJECTED', '   ')).toThrow(BadRequestException);
  });

  it.each(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const)(
    'no permite revisar documentos en estado %s',
    (status) => {
      expect(() => assertReviewable(status, 'APPROVED')).toThrow(BadRequestException);
    },
  );
});
