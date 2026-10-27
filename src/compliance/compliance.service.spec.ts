import {
  aggregateContractorStatus,
  computeProjectStatus,
} from './compliance.service.js';

describe('computeProjectStatus', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const future = new Date('2027-01-01T00:00:00Z');
  const past = new Date('2026-01-01T00:00:00Z');

  it('es COMPLIANT cuando todos los obligatorios estan aprobados y vigentes', () => {
    const status = computeProjectStatus(
      [
        { id: 'rut', required: true, status: 'APPROVED', expiresAt: null },
        { id: 'poliza', required: true, status: 'APPROVED', expiresAt: future },
        { id: 'opcional', required: false, status: 'PENDING', expiresAt: null },
      ],
      now,
    );
    expect(status).toBe('COMPLIANT');
  });

  it('es INCOMPLETE si falta algun obligatorio por aprobar', () => {
    const status = computeProjectStatus(
      [
        { id: 'rut', required: true, status: 'APPROVED', expiresAt: null },
        { id: 'poliza', required: true, status: 'SUBMITTED', expiresAt: future },
      ],
      now,
    );
    expect(status).toBe('INCOMPLETE');
  });

  it('es INCOMPLETE sin documentos obligatorios', () => {
    expect(computeProjectStatus([], now)).toBe('INCOMPLETE');
    expect(
      computeProjectStatus(
        [{ id: 'opcional', required: false, status: 'APPROVED', expiresAt: null }],
        now,
      ),
    ).toBe('INCOMPLETE');
  });

  it('es EXPIRED si un obligatorio esta vencido', () => {
    const status = computeProjectStatus(
      [
        { id: 'rut', required: true, status: 'APPROVED', expiresAt: null },
        { id: 'poliza', required: true, status: 'EXPIRED', expiresAt: past },
      ],
      now,
    );
    expect(status).toBe('EXPIRED');
  });

  it('es EXPIRED si un aprobado tiene fecha de vencimiento pasada', () => {
    const status = computeProjectStatus(
      [
        { id: 'rut', required: true, status: 'APPROVED', expiresAt: null },
        { id: 'poliza', required: true, status: 'APPROVED', expiresAt: past },
      ],
      now,
    );
    expect(status).toBe('EXPIRED');
  });

  it('ignora documentos opcionales vencidos', () => {
    const status = computeProjectStatus(
      [
        { id: 'rut', required: true, status: 'APPROVED', expiresAt: null },
        { id: 'poliza', required: true, status: 'APPROVED', expiresAt: future },
        { id: 'opcional', required: false, status: 'EXPIRED', expiresAt: past },
      ],
      now,
    );
    expect(status).toBe('COMPLIANT');
  });
});

describe('aggregateContractorStatus', () => {
  it('es INCOMPLETE sin proyectos', () => {
    expect(aggregateContractorStatus([])).toBe('INCOMPLETE');
  });

  it('es EXPIRED si algun proyecto esta vencido', () => {
    expect(aggregateContractorStatus(['COMPLIANT', 'EXPIRED', 'INCOMPLETE'])).toBe('EXPIRED');
  });

  it('es COMPLIANT solo si todos estan compliant', () => {
    expect(aggregateContractorStatus(['COMPLIANT', 'COMPLIANT'])).toBe('COMPLIANT');
  });

  it('es INCOMPLETE si hay mezcla sin expired', () => {
    expect(aggregateContractorStatus(['COMPLIANT', 'INCOMPLETE'])).toBe('INCOMPLETE');
  });
});
