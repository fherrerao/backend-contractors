import { Injectable } from '@nestjs/common';
import type { ContractorStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Pick<
  PrismaService,
  'contractor' | 'project' | 'document' | 'worker' | 'projectWorker' | 'projectDocument'
>;

export interface ProjectDocRule {
  requirementId: string;
  required: boolean;
  expires: boolean;
}

interface DocState {
  id: string;
  required: boolean;
  status: string;
  expiresAt: Date | null;
}

/** Estado a partir de los documentos obligatorios (trabajador o, historicamente, proyecto). */
export function computeProjectStatus(docs: DocState[], now = new Date()): ContractorStatus {
  const required = docs.filter((d) => d.required);

  const isExpired = (d: DocState) =>
    d.status === 'EXPIRED' || (d.status === 'APPROVED' && !!d.expiresAt && d.expiresAt < now);

  if (!required.length) return 'INCOMPLETE';
  if (required.some(isExpired)) return 'EXPIRED';
  if (required.every((d) => d.status === 'APPROVED')) return 'COMPLIANT';
  return 'INCOMPLETE';
}

/** Alias historico. */
export const computeContractorStatus = (docs: DocState[], now?: Date) =>
  computeProjectStatus(docs, now);

/** Un archivo vencido solo cuenta como vencido en los proyectos que piden vencimiento. */
export function documentStateForRule(
  doc: { id: string; status: string; expiresAt: Date | null } | undefined,
  rule: ProjectDocRule,
): DocState {
  const status = doc?.status ?? 'PENDING';
  return {
    id: doc?.id ?? rule.requirementId,
    required: rule.required,
    status: !rule.expires && status === 'EXPIRED' ? 'APPROVED' : status,
    expiresAt: rule.expires ? (doc?.expiresAt ?? null) : null,
  };
}

export function statusForRules(
  rules: ProjectDocRule[],
  docs: Array<{ id: string; requirementId: string; status: string; expiresAt: Date | null }>,
  now = new Date(),
): ContractorStatus {
  return computeProjectStatus(
    rules.map((rule) =>
      documentStateForRule(
        docs.find((doc) => doc.requirementId === rule.requirementId),
        rule,
      ),
    ),
    now,
  );
}

/** Agrega estados (trabajadores de un proyecto, o trabajadores de un contratista). */
export function aggregateContractorStatus(statuses: ContractorStatus[]): ContractorStatus {
  if (!statuses.length) return 'INCOMPLETE';
  if (statuses.some((s) => s === 'EXPIRED')) return 'EXPIRED';
  if (statuses.every((s) => s === 'COMPLIANT')) return 'COMPLIANT';
  return 'INCOMPLETE';
}

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculateWorker(workerId: string, db: Db = this.prisma) {
    const worker = await db.worker.findUnique({
      where: { id: workerId },
      select: { id: true, contractorId: true },
    });
    if (!worker) return null;

    const activeAssignments = await db.projectWorker.findMany({
      where: { workerId, project: { isActive: true } },
      select: {
        project: {
          select: {
            projectDocuments: {
              where: { requirement: { isActive: true } },
              select: { requirementId: true, required: true, expires: true },
            },
          },
        },
      },
    });
    const rules = new Map<string, ProjectDocRule>();
    for (const link of activeAssignments) {
      for (const doc of link.project.projectDocuments) {
        const current = rules.get(doc.requirementId);
        rules.set(doc.requirementId, {
          requirementId: doc.requirementId,
          required: (current?.required ?? false) || doc.required,
          expires: (current?.expires ?? false) || doc.expires,
        });
      }
    }
    const docs = rules.size
      ? await db.document.findMany({
          where: { workerId, requirementId: { in: [...rules.keys()] } },
          select: { id: true, requirementId: true, status: true, expiresAt: true },
        })
      : [];
    const status = statusForRules([...rules.values()], docs);
    await db.worker.update({ where: { id: workerId }, data: { status } });

    const assignments = await db.projectWorker.findMany({
      where: { workerId },
      select: { projectId: true },
    });
    for (const link of assignments) {
      await this.recalculateProject(link.projectId, db, false);
    }
    await this.recalculateContractor(worker.contractorId, db);
    return status;
  }

  async recalculateProject(projectId: string, db: Db = this.prisma, updateContractor = true) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, contractorId: true },
    });
    if (!project) return null;

    const rules = await db.projectDocument.findMany({
      where: { projectId, requirement: { isActive: true } },
      select: { requirementId: true, required: true, expires: true },
    });
    const links = await db.projectWorker.findMany({
      where: { projectId },
      select: {
        worker: {
          select: {
            isActive: true,
            documents: {
              where: { requirementId: { in: rules.map((rule) => rule.requirementId) } },
              select: { id: true, requirementId: true, status: true, expiresAt: true },
            },
          },
        },
      },
    });
    const status = aggregateContractorStatus(
      links
        .filter((link) => link.worker.isActive)
        .map((link) => statusForRules(rules, link.worker.documents)),
    );
    await db.project.update({ where: { id: projectId }, data: { status } });
    if (updateContractor) await this.recalculateContractor(project.contractorId, db);
    return status;
  }

  async recalculateContractor(contractorId: string, db: Db = this.prisma) {
    const workers = await db.worker.findMany({
      where: { contractorId, isActive: true },
      select: { status: true },
    });
    const status = aggregateContractorStatus(workers.map((w) => w.status));
    await db.contractor.update({ where: { id: contractorId }, data: { status } });
    return status;
  }

  async recalculate(workerOrContractorId: string, db: Db = this.prisma) {
    const worker = await db.worker.findUnique({
      where: { id: workerOrContractorId },
      select: { id: true },
    });
    if (worker) return this.recalculateWorker(workerOrContractorId, db);
    return this.recalculateContractor(workerOrContractorId, db);
  }

  async recalculateAll() {
    const workers = await this.prisma.worker.findMany({ select: { id: true } });
    for (const worker of workers) await this.recalculateWorker(worker.id);
    const contractors = await this.prisma.contractor.findMany({ select: { id: true } });
    for (const contractor of contractors) await this.recalculateContractor(contractor.id);
  }

  async expireDocuments() {
    const now = new Date();
    const expired = await this.prisma.document.findMany({
      where: {
        status: 'APPROVED',
        expiresAt: { lt: now },
        requirement: { isActive: true, projectDocuments: { some: { expires: true } } },
      },
      select: { id: true, workerId: true },
    });
    if (!expired.length) return 0;

    await this.prisma.document.updateMany({
      where: { id: { in: expired.map((d) => d.id) } },
      data: { status: 'EXPIRED' },
    });
    for (const id of new Set(expired.map((d) => d.workerId))) {
      await this.recalculateWorker(id);
    }
    return expired.length;
  }
}
