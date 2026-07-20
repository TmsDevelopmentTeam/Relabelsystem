import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Renumera `position` a 1..N dentro de cada orderNumber, por orden de createdAt.
// Si se pasa ?order=X, solo renumera esa orden. Si no, todas.
export async function POST(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order');

  const orders = order
    ? [order]
    : (await prisma.labelRoll.findMany({
        distinct: ['orderNumber'],
        select: { orderNumber: true },
      })).map((r) => r.orderNumber);

  const result: any[] = [];
  for (const on of orders) {
    if (on == null) continue;
    const items = await prisma.labelRoll.findMany({
      where: { orderNumber: on },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    for (let i = 0; i < items.length; i++) {
      await prisma.labelRoll.update({
        where: { id: items[i].id },
        data: { position: i + 1 },
      });
    }
    result.push({ orderNumber: on, renumbered: items.length });
  }
  return NextResponse.json({ ok: true, result });
}
