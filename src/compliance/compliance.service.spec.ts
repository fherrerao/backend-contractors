import { computeContractorStatus } from './compliance.service.js';

describe('computeContractorStatus', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const future = new Date('2027-01-01T00:00:00Z');
  const past = new Date('2026-01-01T00:00:00Z');
  const required = ['rut', 'poliza'];

  it('es COMPLIANT cuando todos los obligatorios estan aprobados y vigentes', () => {
    const status = computeContractorStatus(
      required,
      [
        { typeId: 'rut', status: 'APPROVED', expiresAt: null },
        { typeId: 'poliza', status: 'APPROVED', expiresAt: future },
        { typeId: 'opcional', status: 'PENDING', expiresAt: null },
      ],
      now,
    );
    expect(status).toBe('COMPLIANT');
  });

  it('es INCOMPLETE si falta algun obligatorio por aprobar', () => {
    const status = computeContractorStatus(
      required,
      [
        { typeId: 'rut', status: 'APPROVED', expiresAt: null },
        { typeId: 'poliza', status: 'SUBMITTED', expiresAt: future },
      ],
      now,
    );
    expect(status).toBe('INCOMPLETE');
  });

  it('es INCOMPLETE si un obligatorio no tiene documento', () => {
    const status = computeContractorStatus(
      required,
      [{ typeId: 'rut', status: 'APPROVED', expiresAt: null }],
      now,
    );
    expect(status).toBe('INCOMPLETE');
  });

  it('es EXPIRED si un obligatorio esta vencido', () => {
    const status = computeContractorStatus(
      required,
      [
        { typeId: 'rut', status: 'APPROVED', expiresAt: null },
        { typeId: 'poliza', status: 'EXPIRED', expiresAt: past },
      ],
      now,
    );
    expect(status).toBe('EXPIRED');
  });

  it('es EXPIRED si un aprobado tiene fecha de vencimiento pasada', () => {
    const status = computeContractorStatus(
      required,
      [
        { typeId: 'rut', status: 'APPROVED', expiresAt: null },
        { typeId: 'poliza', status: 'APPROVED', expiresAt: past },
      ],
      now,
    );
    expect(status).toBe('EXPIRED');
  });

  it('ignora documentos opcionales vencidos', () => {
    const status = computeContractorStatus(
      required,
      [
        { typeId: 'rut', status: 'APPROVED', expiresAt: null },
        { typeId: 'poliza', status: 'APPROVED', expiresAt: future },
        { typeId: 'opcional', status: 'EXPIRED', expiresAt: past },
      ],
      now,
    );
    expect(status).toBe('COMPLIANT');
  });
});
