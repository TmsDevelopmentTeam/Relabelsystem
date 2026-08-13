import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startOfTodayMx } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vista supervisor KROMA (solo lectura): rollos en vivo, cajas matched, alertas de
// mismatch, KPIs y progreso por orden USDOM.
export async function GET() {
  const startToday = startOfTodayMx();

  const [boxes, rollsRecent, rollsTotal, rollsHoy, matchAlerts] = await Promise.all([
    prisma.kromaBox.findMany({
      select: { usdomCpu: true, usdomMonitor: true, status: true, matchedAt: true, matchedBy: true, cajaLabel: true, stCpu: true, stMonitor: true },
    }),
    prisma.labelRoll.findMany({
      orderBy: { createdAt: 'desc' }, take: 30,
      select: { orderNumber: true, value: true, position: true, operator: true, createdAt: true },
    }),
    prisma.labelRoll.count(),
    prisma.labelRoll.count({ where: { createdAt: { gte: startToday } } }),
    prisma.scanEvent.findMany({
      where: { step: 'MATCH', result: 'MISMATCH', createdAt: { gte: startToday } },
      orderBy: { createdAt: 'desc' }, take: 15,
      select: { assetTag: true, operator: true, message: true, createdAt: true },
    }),
  ]);

  const total = boxes.length;
  const matched = boxes.filter((b) => b.status === 'MATCHED').length;
  const matchHoy = boxes.filter((b) => b.matchedAt && new Date(b.matchedAt as any).getTime() >= startToday.getTime()).length;

  // Progreso por orden CPU
  const map = new Map<string, { usdomCpu: string; usdomMonitor: string; total: number; matched: number }>();
  for (const b of boxes) {
    const cur = map.get(b.usdomCpu) ?? { usdomCpu: b.usdomCpu, usdomMonitor: b.usdomMonitor, total: 0, matched: 0 };
    cur.total++;
    if (b.status === 'MATCHED') cur.matched++;
    map.set(b.usdomCpu, cur);
  }
  const ordenes = [...map.values()].sort((a, b) => a.usdomCpu.localeCompare(b.usdomCpu));

  // Últimas cajas matched
  const matchedRecent = boxes
    .filter((b) => b.matchedAt)
    .sort((a, b) => new Date(b.matchedAt as any).getTime() - new Date(a.matchedAt as any).getTime())
    .slice(0, 30)
    .map((b) => ({ caja: b.cajaLabel, usdomCpu: b.usdomCpu, usdomMonitor: b.usdomMonitor, stCpu: b.stCpu, stMonitor: b.stMonitor, matchedAt: b.matchedAt, matchedBy: b.matchedBy }));

  return NextResponse.json({
    counts: { total, matched, pendientes: total - matched, matchHoy, rollsTotal, rollsHoy },
    ordenes,
    rollsRecent,
    matchedRecent,
    matchAlerts,
    nowISO: new Date().toISOString(),
  });
}
