import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mueve TODOS los LabelRoll a la orden ?to=X (fuerza, sin validar).
// Recalcula positions 1..N por createdAt asc.
// Uso administrativo, no expuesto en la UI.
export async function POST(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to')?.trim();
  if (!to) return NextResponse.json({ error: 'falta ?to' }, { status: 400 });

  const items = await prisma.labelRoll.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  for (let i = 0; i < items.length; i++) {
    await prisma.labelRoll.update({
      where: { id: items[i].id },
      data: { orderNumber: to, position: i + 1 },
    });
  }
  return NextResponse.json({ ok: true, moved: items.length, order: to });
}
