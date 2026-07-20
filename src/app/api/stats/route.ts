import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [total, pending, paired, labeled, matched, byType, recent, rollTotal] = await Promise.all([
    prisma.equipment.count(),
    prisma.equipment.count({ where: { status: 'PENDING' } }),
    prisma.equipment.count({ where: { status: 'PAIR_READY' } }),
    prisma.equipment.count({ where: { status: 'LABELED' } }),
    prisma.equipment.count({ where: { status: 'MATCHED' } }),
    prisma.equipment.groupBy({ by: ['equipmentType', 'status'], _count: { _all: true } }),
    prisma.scanEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    prisma.labelRoll.count(),
  ]);

  const typeAgg: Record<string, any> = {};
  for (const row of byType) {
    const t = row.equipmentType;
    if (!typeAgg[t]) typeAgg[t] = { total: 0, pending: 0, paired: 0, labeled: 0, matched: 0 };
    typeAgg[t].total += row._count._all;
    const k = { PENDING:'pending', PAIR_READY:'paired', LABELED:'labeled', MATCHED:'matched' }[row.status];
    if (k) typeAgg[t][k] += row._count._all;
  }

  return NextResponse.json({
    total, pending, paired, labeled, matched,
    progressPct: total ? Math.round((matched / total) * 100) : 0,
    progressPctExact: total ? (matched / total) * 100 : 0,
    byType: typeAgg,
    rollTotal,
    recent,
  });
}
