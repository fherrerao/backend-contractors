import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async stats(@CurrentUser() user: AuthUser) {
    const projectFilter =
      user.role === 'CONTRACTOR_USER'
        ? { project: { contractorId: user.contractorId ?? '' } }
        : {};
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [byStatus, docsByStatus, expiringSoon] = await Promise.all([
      this.prisma.contractor.groupBy({
        by: ['status'],
        where: user.role === 'CONTRACTOR_USER' ? { id: user.contractorId ?? '' } : { isActive: true },
        _count: true,
      }),
      this.prisma.document.groupBy({
        by: ['status'],
        where: projectFilter,
        _count: true,
      }),
      this.prisma.document.findMany({
        where: {
          ...projectFilter,
          status: 'APPROVED',
          expiresAt: { gte: new Date(), lte: in30Days },
        },
        orderBy: { expiresAt: 'asc' },
        take: 10,
        select: {
          id: true,
          name: true,
          expiresAt: true,
          project: {
            select: {
              id: true,
              name: true,
              contractor: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const toRecord = (rows: { status: string; _count: number }[]) =>
      Object.fromEntries(rows.map((r) => [r.status, r._count]));

    return {
      contractors: toRecord(byStatus),
      documents: toRecord(docsByStatus),
      expiringSoon: expiringSoon.map((d) => ({
        id: d.id,
        expiresAt: d.expiresAt,
        type: { name: d.name },
        project: { id: d.project.id, name: d.project.name },
        contractor: d.project.contractor,
      })),
    };
  }
}
