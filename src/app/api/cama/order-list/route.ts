import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Devuelve todos los assets de una orden en el ORDEN DEL FILE:
// Pallet asc → Cama asc → Position asc.
// Sirve para mostrar la lista "cuál sigue" en el módulo Cama.
export async function GET(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order')?.trim();
  if (!order) return NextResponse.json({ error: 'falta ?order' }, { status: 400 });

  const items = await prisma.ubicacion.findMany({
    where: { OR: [{ ordenDell: order }, { po: order }] },
    select: { id: true, assetTag: true, inventario: true, cama: true, position: true, pallet: true, partida: true },
  });

  // Ordenar en Node por Pallet → Cama → Position (numérico si aplica)
  const numOrStr = (v: string | null) => {
    if (v == null) return { n: Number.POSITIVE_INFINITY, s: '' };
    const n = Number(v);
    return isNaN(n) ? { n: Number.POSITIVE_INFINITY, s: v } : { n, s: v };
  };
  items.sort((a, b) => {
    const pa = numOrStr(a.pallet), pb = numOrStr(b.pallet);
    if (pa.n !== pb.n) return pa.n - pb.n;
    if (pa.s !== pb.s) return pa.s.localeCompare(pb.s);
    const ca = numOrStr(a.cama), cb = numOrStr(b.cama);
    if (ca.n !== cb.n) return ca.n - cb.n;
    if (ca.s !== cb.s) return ca.s.localeCompare(cb.s);
    const oa = numOrStr(a.position), ob = numOrStr(b.position);
    if (oa.n !== ob.n) return oa.n - ob.n;
    return oa.s.localeCompare(ob.s);
  });

  return NextResponse.json({ order, total: items.length, items });
}
