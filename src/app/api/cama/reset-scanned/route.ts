import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Resetea el estado 'escaneado' de las ubicaciones.
// ?order=X  → solo esa orden
// sin params → TODAS
export async function POST(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order')?.trim();
  const where = order ? { OR: [{ ordenDell: order }, { po: order }] } : {};
  const res = await prisma.ubicacion.updateMany({
    where, data: { scannedAt: null, scannedBy: null },
  });
  return NextResponse.json({ ok: true, cleared: res.count, order: order ?? 'ALL' });
}
