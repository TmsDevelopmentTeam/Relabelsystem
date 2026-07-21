import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Marca como scannedAt=now() todas las ubicaciones cuyo ordenDell (o po) esté
// en el array `orders`. Uso administrativo.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const orders: string[] = Array.isArray(body?.orders) ? body.orders.map(String) : [];
  const operator = String(body?.operator ?? 'bulk-mark');
  if (!orders.length) return NextResponse.json({ error: 'falta body.orders (array)' }, { status: 400 });

  const res = await prisma.ubicacion.updateMany({
    where: {
      scannedAt: null,
      OR: [
        { ordenDell: { in: orders } },
        { po: { in: orders } },
      ],
    },
    data: { scannedAt: new Date(), scannedBy: operator },
  });
  return NextResponse.json({ ok: true, marked: res.count, orders });
}
