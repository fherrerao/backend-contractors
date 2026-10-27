import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth.types.js';

export function assertContractorAccess(user: AuthUser, contractorId: string) {
  if (user.role === 'CONTRACTOR_USER' && user.contractorId !== contractorId) {
    throw new ForbiddenException('No tienes acceso a este contratista');
  }
}
