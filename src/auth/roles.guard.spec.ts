import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../generated/prisma/enums.js';
import type { AuthUser } from './auth.types.js';
import { RolesGuard } from './roles.guard.js';
import { assertContractorAccess } from './scope.js';

function contextFor(user?: Partial<AuthUser>) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(roles?: Role[]) {
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('permite el acceso cuando la ruta no define roles', () => {
    expect(guardWith(undefined).canActivate(contextFor({ role: 'CONTRACTOR_USER' }))).toBe(true);
  });

  it('permite el acceso cuando el rol coincide', () => {
    expect(guardWith(['APPROVER', 'ADMIN']).canActivate(contextFor({ role: 'APPROVER' }))).toBe(true);
  });

  it('rechaza cuando el rol no coincide', () => {
    expect(() =>
      guardWith(['APPROVER']).canActivate(contextFor({ role: 'CONTRACTOR_USER' })),
    ).toThrow(ForbiddenException);
  });

  it('rechaza cuando no hay usuario', () => {
    expect(() => guardWith(['ADMIN']).canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});

describe('assertContractorAccess', () => {
  const base = { sub: 'u1', email: 'a@b.c', name: 'A' };

  it('permite a un contratista acceder a su propia empresa', () => {
    expect(() =>
      assertContractorAccess({ ...base, role: 'CONTRACTOR_USER', contractorId: 'c1' }, 'c1'),
    ).not.toThrow();
  });

  it('impide a un contratista acceder a otra empresa', () => {
    expect(() =>
      assertContractorAccess({ ...base, role: 'CONTRACTOR_USER', contractorId: 'c1' }, 'c2'),
    ).toThrow(ForbiddenException);
  });

  it('permite a aprobadores y administradores acceder a cualquier empresa', () => {
    expect(() =>
      assertContractorAccess({ ...base, role: 'APPROVER', contractorId: null }, 'c2'),
    ).not.toThrow();
    expect(() =>
      assertContractorAccess({ ...base, role: 'ADMIN', contractorId: null }, 'c2'),
    ).not.toThrow();
  });
});
