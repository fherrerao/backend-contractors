import { Injectable } from '@nestjs/common';
import type { ContractorStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Pick<PrismaService, 'contractor' | 'project' | 'document'>;

interface DocState {
  id: string;
  required: boolean;
  status: string;
  expiresAt: Date | null;
}

/** Status de un proyecto a partir de sus documentos requeridos. */
export function computeProjectStatus(docs: DocState[], now = new Date()): ContractorStatus {
  const required = docs.filter((d) => d.required);

  const isExpired = (d: DocState) =>
    d.status === 'EXPIRED' || (d.status === 'APPROVED' && !!d.expiresAt && d.expiresAt < now);

  if (!required.length) return 'INCOMPLETE';
  if (required.some(isExpired)) return 'EXPIRED';
  if (required.every((d) => d.status === 'APPROVED')) return 'COMPLIANT';
  return 'INCOMPLETE';
}

/** Alias histórico. */
export const computeContractorStatus = (docs: DocState[], now?: Date) =>
  computeProjectStatus(docs, now);

/** Agrega status de proyectos activos al status del contratista. */
export function aggregateContractorStatus(projectStatuses: ContractorStatus[]): ContractorStatus {
  if (!projectStatuses.length) return 'INCOMPLETE';
  if (projectStatuses.some((s) => s === 'EXPIRED')) return 'EXPIRED';
  if (projectStatuses.every((s) => s === 'COMPLIANT')) return 'COMPLIANT';
  return 'INCOMPLETE';
}

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculateProject(projectId: string, db: Db = this.prisma) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, contractorId: true },
    });
    if (!project) return null;

    const docs = await db.document.findMany({
      where: { projectId },
      select: { id: true, required: true, status: true, expiresAt: true },
    });
    const status = computeProjectStatus(docs);
    await db.project.update({ where: { id: projectId }, data: { status } });
    await this.recalculateContractor(project.contractorId, db);
    return status;
  }

  async recalculateContractor(contractorId: string, db: Db = this.prisma) {
    const projects = await db.project.findMany({
      where: { contractorId, isActive: true },
      select: { status: true },
    });
    const status = aggregateContractorStatus(projects.map((p) => p.status));
    await db.contractor.update({ where: { id: contractorId }, data: { status } });
    return status;
  }

  async recalculate(projectOrContractorId: string, db: Db = this.prisma) {
    const project = await db.project.findUnique({
      where: { id: projectOrContractorId },
      select: { id: true },
    });
    if (project) return this.recalculateProject(projectOrContractorId, db);
    return this.recalculateContractor(projectOrContractorId, db);
  }

  async recalculateAll() {
    const projects = await this.prisma.project.findMany({ select: { id: true } });
    for (const p of projects) await this.recalculateProject(p.id);
  }

  async expireDocuments() {
    const now = new Date();
    const expired = await this.prisma.document.findMany({
      where: { status: 'APPROVED', expiresAt: { lt: now } },
      select: { id: true, projectId: true },
    });
    if (!expired.length) return 0;

    await this.prisma.document.updateMany({
      where: { id: { in: expired.map((d) => d.id) } },
      data: { status: 'EXPIRED' },
    });
    for (const id of new Set(expired.map((d) => d.projectId))) {
      await this.recalculateProject(id);
    }
    return expired.length;
  }
}
