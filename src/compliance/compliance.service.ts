import { Injectable } from '@nestjs/common';
import type { ContractorStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Pick<PrismaService, 'contractor' | 'document' | 'documentType'>;

interface DocState {
  typeId: string;
  status: string;
  expiresAt: Date | null;
}

export function computeContractorStatus(
  requiredTypeIds: string[],
  docs: DocState[],
  now = new Date(),
): ContractorStatus {
  const byType = new Map(docs.map((d) => [d.typeId, d]));
  const required = requiredTypeIds.map((id) => byType.get(id));

  const isExpired = (d?: DocState) =>
    !!d && (d.status === 'EXPIRED' || (d.status === 'APPROVED' && !!d.expiresAt && d.expiresAt < now));

  if (required.some(isExpired)) return 'EXPIRED';
  if (required.every((d) => d?.status === 'APPROVED')) return 'COMPLIANT';
  return 'INCOMPLETE';
}

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(contractorId: string, db: Db = this.prisma) {
    const [requiredTypes, docs] = await Promise.all([
      db.documentType.findMany({ where: { isActive: true, required: true }, select: { id: true } }),
      db.document.findMany({
        where: { contractorId },
        select: { typeId: true, status: true, expiresAt: true },
      }),
    ]);
    const status = computeContractorStatus(requiredTypes.map((t) => t.id), docs);
    await db.contractor.update({ where: { id: contractorId }, data: { status } });
    return status;
  }

  async recalculateAll() {
    const contractors = await this.prisma.contractor.findMany({ select: { id: true } });
    for (const c of contractors) await this.recalculate(c.id);
  }

  /** Crea documentos PENDING para todos los tipos activos que aun no tenga el contratista. */
  async ensureDocuments(contractorId?: string) {
    const [types, contractors] = await Promise.all([
      this.prisma.documentType.findMany({ where: { isActive: true }, select: { id: true } }),
      this.prisma.contractor.findMany({
        where: contractorId ? { id: contractorId } : undefined,
        select: { id: true },
      }),
    ]);
    const data = contractors.flatMap((c) => types.map((t) => ({ contractorId: c.id, typeId: t.id })));
    if (data.length) await this.prisma.document.createMany({ data, skipDuplicates: true });
  }

  async expireDocuments() {
    const now = new Date();
    const expired = await this.prisma.document.findMany({
      where: { status: 'APPROVED', expiresAt: { lt: now } },
      select: { id: true, contractorId: true },
    });
    if (!expired.length) return 0;

    await this.prisma.document.updateMany({
      where: { id: { in: expired.map((d) => d.id) } },
      data: { status: 'EXPIRED' },
    });
    for (const id of new Set(expired.map((d) => d.contractorId))) {
      await this.recalculate(id);
    }
    return expired.length;
  }
}
