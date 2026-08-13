import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mxDateTime, startOfTodayMx } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MX_OFFSET_MS = 6 * 3600 * 1000;

export async function GET() {
  try {
    const boxes = await prisma.kromaBox.findMany({
      select: { usdomCpu: true, usdomMonitor: true, status: true, matchedAt: true, matchedBy: true, cajaLabel: true, stCpu: true, stMonitor: true },
    });
    const total = boxes.length;
    const matched = boxes.filter((b) => b.status === 'MATCHED').length;

    // Progreso por orden CPU
    const map = new Map<string, { usdomCpu: string; usdomMonitor: string; total: number; matched: number }>();
    for (const b of boxes) {
      const cur = map.get(b.usdomCpu) ?? { usdomCpu: b.usdomCpu, usdomMonitor: b.usdomMonitor, total: 0, matched: 0 };
      cur.total++;
      if (b.status === 'MATCHED') cur.matched++;
      map.set(b.usdomCpu, cur);
    }
    const ordenes = [...map.values()].sort((a, b) => a.usdomCpu.localeCompare(b.usdomCpu));

    // Velocidad (cajas MATCHED por ventana de tiempo)
    const now = Date.now();
    const matchedTimes = boxes.filter((b) => b.matchedAt).map((b) => new Date(b.matchedAt as any).getTime());
    const since = (ms: number) => matchedTimes.filter((t) => t >= now - ms).length;
    const startToday = startOfTodayMx().getTime();
    const rate = {
      min1: since(60 * 1000),
      min10: since(10 * 60 * 1000),
      min30: since(30 * 60 * 1000),
      hour1: since(60 * 60 * 1000),
      hour6: since(6 * 60 * 60 * 1000),
      today: matchedTimes.filter((t) => t >= startToday).length,
      ratePerMin: 0,
    };
    rate.ratePerMin = Math.round((rate.min10 / 10) * 10) / 10;

    // Distribución por hora (hoy, hora México)
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    for (const t of matchedTimes) {
      if (t < startToday) continue;
      const h = new Date(t - MX_OFFSET_MS).getUTCHours();
      hourly[h].count++;
    }
    const maxHour = Math.max(1, ...hourly.map((h) => h.count));

    // Por día (hora México)
    const dayMap = new Map<string, number>();
    for (const t of matchedTimes) {
      const key = mxDateTime(new Date(t)).slice(0, 10);
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const days = [...dayMap.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => b.date.localeCompare(a.date));
    const maxDay = Math.max(1, ...days.map((d) => d.count));

    // Últimas cajas matched
    const recientes = boxes
      .filter((b) => b.matchedAt)
      .sort((a, b) => new Date(b.matchedAt as any).getTime() - new Date(a.matchedAt as any).getTime())
      .slice(0, 15)
      .map((b) => ({ caja: b.cajaLabel, usdomCpu: b.usdomCpu, stCpu: b.stCpu, stMonitor: b.stMonitor, matchedAt: b.matchedAt, matchedBy: b.matchedBy }));

    return NextResponse.json({
      ok: true,
      total, matched, pendientes: total - matched,
      progressPct: total ? Math.round((matched / total) * 100) : 0,
      progressPctExact: total ? (matched / total) * 100 : 0,
      ordenes, rate, hourly, maxHour, days, maxDay, recientes,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
