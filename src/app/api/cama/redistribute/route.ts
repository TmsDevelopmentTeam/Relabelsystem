import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Redistribuye TODOS los items de una orden en camas consecutivas de N items.
// Params:
//   order=X          · orden Dell (obligatorio)
//   partida=Y        · filtro opcional
//   perCama=6        · items por cama (default 6)
//   camasPerPallet=5 · camas por pallet (default 5)
//   dry=1            · solo simula
// Ordena por inventario ASC y asigna:
//   P1/C1/pos 1..N, P1/C2/pos N+1..2N, ..., P1/C5/pos ..N*5
//   P2/C1/pos 1..N, etc.
export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const order = q.get('order')?.trim();
  const partida = q.get('partida')?.trim() ?? null;
  const perCama = Number(q.get('perCama') ?? '6');
  const camasPerPallet = Number(q.get('camasPerPallet') ?? '5');
  const dry = q.get('dry') === '1';
  if (!order) return NextResponse.json({ error: 'params: order' }, { status: 400 });

  const items = await prisma.ubicacion.findMany({
    where: {
      OR: [{ ordenDell: order }, { po: order }],
      ...(partida ? { partida } : {}),
    },
    orderBy: { inventario: 'asc' },
  });

  const perPallet = perCama * camasPerPallet;
  const changes: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const pallet = String(Math.floor(i / perPallet) + 1);
    const withinPallet = i % perPallet;
    const cama = String(Math.floor(withinPallet / perCama) + 1);
    const position = String((withinPallet % perCama) + 1 + Math.floor(withinPallet / perCama) * perCama);
    changes.push({
      id: it.id, assetTag: it.assetTag, inv: it.inventario,
      from: { pallet: it.pallet, cama: it.cama, position: it.position },
      to: { pallet, cama, position },
    });
  }

  const shifts = changes.filter((c) =>
    c.from.pallet !== c.to.pallet || c.from.cama !== c.to.cama || c.from.position !== c.to.position
  );

  if (dry) {
    return NextResponse.json({
      ok: true, dry: true,
      total: items.length, willChange: shifts.length,
      sample: shifts.slice(0, 10),
    });
  }

  await prisma.$transaction(async (tx) => {
    // Fase 1: mover a positions temporales (evita colisiones por unique)
    for (const c of changes) {
      await tx.ubicacion.update({
        where: { id: c.id },
        data: { position: `_tmp_${c.id}` },
      });
    }
    // Fase 2: aplicar los valores finales
    for (const c of changes) {
      await tx.ubicacion.update({
        where: { id: c.id },
        data: c.to,
      });
    }
  });

  return NextResponse.json({ ok: true, dry: false, total: items.length, changed: shifts.length });
}
