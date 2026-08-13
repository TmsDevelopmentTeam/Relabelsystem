import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Progreso KROMA: total, matched, y desglose por orden CPU (USDOM).
export async function GET() {
  try {
    const total = await prisma.kromaBox.count();
    const matched = await prisma.kromaBox.count({ where: { status: 'MATCHED' } });

    const boxes = await prisma.kromaBox.findMany({
      select: { usdomCpu: true, usdomMonitor: true, status: true },
    });
    const map = new Map<string, { usdomCpu: string; usdomMonitor: string; total: number; matched: number }>();
    for (const b of boxes) {
      const cur = map.get(b.usdomCpu) ?? { usdomCpu: b.usdomCpu, usdomMonitor: b.usdomMonitor, total: 0, matched: 0 };
      cur.total++;
      if (b.status === 'MATCHED') cur.matched++;
      map.set(b.usdomCpu, cur);
    }
    const ordenes = [...map.values()].sort((a, b) => a.usdomCpu.localeCompare(b.usdomCpu));

    return NextResponse.json({ ok: true, total, matched, pendientes: total - matched, ordenes });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
