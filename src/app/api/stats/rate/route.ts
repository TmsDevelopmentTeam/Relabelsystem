import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Velocidad de procesamiento (basado en Equipment.matchedAt)
// Devuelve conteos: último min, 10min, 30min, hora, 6hrs, hoy, y desglose por hora del día actual.
export async function GET() {
  const rows = await prisma.equipment.findMany({
    where: { matchedAt: { not: null } },
    select: { matchedAt: true },
  });
  const now = Date.now();
  const buckets = { min1: 0, min10: 0, min30: 0, hour1: 0, hour6: 0, today: 0 };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startTs = startOfToday.getTime();

  const hourly: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourly[h] = 0;

  for (const r of rows) {
    if (!r.matchedAt) continue;
    const t = new Date(r.matchedAt).getTime();
    const diff = now - t;
    if (diff <= 60_000) buckets.min1++;
    if (diff <= 10 * 60_000) buckets.min10++;
    if (diff <= 30 * 60_000) buckets.min30++;
    if (diff <= 60 * 60_000) buckets.hour1++;
    if (diff <= 6 * 3600_000) buckets.hour6++;
    if (t >= startTs) {
      buckets.today++;
      const h = new Date(t).getHours();
      hourly[h] = (hourly[h] ?? 0) + 1;
    }
  }

  const ratePerMin = buckets.min10 / 10;
  const ratePerHour = buckets.hour1;
  const hourlyArr = Object.entries(hourly).map(([h, c]) => ({ hour: Number(h), count: c }));
  const maxHour = Math.max(1, ...hourlyArr.map((x) => x.count));

  return NextResponse.json({
    ...buckets,
    ratePerMin: Math.round(ratePerMin * 10) / 10,
    ratePerHour,
    hourly: hourlyArr,
    maxHour,
    nowISO: new Date().toISOString(),
  });
}
