import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Marca como scannedAt=now() todos los Ubicacion cuyo ordenDell (o po) sea
// numéricamente MENOR a ?order=X. Uso administrativo.
export async function POST(req: NextRequest) {
  const cut = req.nextUrl.searchParams.get('order')?.trim();
  const operator = req.nextUrl.searchParams.get('operator')?.trim() || 'bulk-mark';
  if (!cut) return NextResponse.json({ error: 'falta ?order' }, { status: 400 });

  const cutN = Number(cut);
  if (!isFinite(cutN)) return NextResponse.json({ error: 'order debe ser numérico' }, { status: 400 });

  // Traer todas y filtrar por comparación numérica
  const all = await prisma.ubicacion.findMany({
    where: { scannedAt: null },
    select: { id: true, ordenDell: true, po: true },
  });
  const ids: number[] = [];
  for (const u of all) {
    const o = u.ordenDell ?? u.po;
    if (!o) continue;
    const n = Number(o);
    if (isFinite(n) && n < cutN) ids.push(u.id);
  }

  const res = await prisma.ubicacion.updateMany({
    where: { id: { in: ids } },
    data: { scannedAt: new Date(), scannedBy: operator },
  });

  return NextResponse.json({ ok: true, marked: res.count, cutoff: cut });
}
