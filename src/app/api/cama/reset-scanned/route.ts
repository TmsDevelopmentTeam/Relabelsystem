import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Resetea el estado 'escaneado' de las ubicaciones.
// ?order=X       → solo esa orden
// ?producto=QCS  → solo ese producto (substring, case-insensitive)
// sin params     → TODAS
export async function POST(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order')?.trim();
  const producto = req.nextUrl.searchParams.get('producto')?.trim();
  let where: any = {};
  if (order) where = { OR: [{ ordenDell: order }, { po: order }] };
  else if (producto) where = { producto: { contains: producto } };
  const res = await prisma.ubicacion.updateMany({
    where, data: { scannedAt: null, scannedBy: null },
  });
  return NextResponse.json({ ok: true, cleared: res.count, filter: order ? `order=${order}` : producto ? `producto~${producto}` : 'ALL' });
}
