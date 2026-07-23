import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Devuelve conteo de equipos MATCHED agrupados por día (matchedAt).
// Formato: [{ date: 'YYYY-MM-DD', total, byType: { LAPTOP, MONITOR, DESKTOP, OTHER } }]
// Ordenado descendente (más reciente arriba).
export async function GET() {
  const rows = await prisma.equipment.findMany({
    where: { matchedAt: { not: null } },
    select: { matchedAt: true, equipmentType: true },
  });

  const map = new Map<string, { total: number; byType: Record<string, number> }>();
  for (const r of rows) {
    if (!r.matchedAt) continue;
    // toISOString → 2026-07-22T12:34:56Z → tomo solo YYYY-MM-DD en local
    const d = new Date(r.matchedAt);
    // Usar hora local del server (America/Mexico si el server está en Mexico)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { total: 0, byType: { LAPTOP: 0, MONITOR: 0, DESKTOP: 0, OTHER: 0 } });
    const entry = map.get(key)!;
    entry.total++;
    entry.byType[r.equipmentType] = (entry.byType[r.equipmentType] ?? 0) + 1;
  }

  const days = [...map.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const max = Math.max(1, ...days.map((d) => d.total));
  return NextResponse.json({ days, max, totalDays: days.length });
}
