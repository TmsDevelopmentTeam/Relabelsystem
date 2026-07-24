import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Shift +1 de todas las Ubicaciones de una orden con position >= min.
// Query: order=X · min=N · exclude=assetTag (opcional) · partida=Y (opcional) · dry=1
export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const order = q.get('order')?.trim();
  const min = Number(q.get('min') ?? '0');
  const exclude = q.get('exclude')?.trim() ?? null;
  const partida = q.get('partida')?.trim() ?? null;
  const dry = q.get('dry') === '1';
  if (!order || !isFinite(min)) return NextResponse.json({ error: 'params: order, min' }, { status: 400 });

  const candidates = await prisma.ubicacion.findMany({
    where: {
      OR: [{ ordenDell: order }, { po: order }],
      ...(partida ? { partida } : {}),
    },
  });
  const toShift = candidates
    .filter((u) => {
      if (exclude && u.assetTag === exclude) return false;
      const n = Number(u.position);
      return isFinite(n) && n >= min;
    })
    .sort((a, b) => Number(b.position) - Number(a.position));

  if (dry) {
    return NextResponse.json({
      ok: true, dry: true,
      willShift: toShift.length,
      sample: toShift.slice(0, 10).map((u) => ({
        assetTag: u.assetTag, inv: u.inventario, partida: u.partida,
        pallet: u.pallet, cama: u.cama, from: u.position, to: String(Number(u.position) + 1),
      })),
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    for (const u of toShift) {
      await tx.ubicacion.update({
        where: { id: u.id },
        data: { position: String(Number(u.position) + 1) },
      });
    }
    return { shifted: toShift.length };
  });

  return NextResponse.json({ ok: true, dry: false, ...result });
}
