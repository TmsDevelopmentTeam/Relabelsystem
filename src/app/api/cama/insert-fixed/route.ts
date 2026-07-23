import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Inserta un asset en Ubicacion con Pallet/Cama/Position fijos.
// Recorre en +1 todos los registros con MISMO pallet+cama+partida y position >= newPos.
// Query params:
//   assetTag=X  · pallet=P · cama=C · position=N · partida=Y (opcional)
//   dry=1       · sólo simula
export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const assetTag = norm(q.get('assetTag'));
  const pallet = q.get('pallet')?.trim() ?? null;
  const cama = q.get('cama')?.trim() ?? null;
  const positionStr = q.get('position')?.trim() ?? null;
  const partida = q.get('partida')?.trim() ?? null;
  const dry = q.get('dry') === '1';

  if (!assetTag || !pallet || !cama || !positionStr) {
    return NextResponse.json({ error: 'Faltan params: assetTag, pallet, cama, position' }, { status: 400 });
  }
  const newPos = Number(positionStr);
  if (!isFinite(newPos)) return NextResponse.json({ error: 'position debe ser numérica' }, { status: 400 });

  const eq = await prisma.equipment.findUnique({ where: { assetTag } });
  if (!eq) return NextResponse.json({ ok: false, reason: 'NOT_IN_EQUIPMENT' });

  const existing = await prisma.ubicacion.findUnique({ where: { assetTag } });
  if (existing) return NextResponse.json({ ok: false, reason: 'ALREADY_IN_UBICACION', existing });

  // Buscar los registros a recorrer: mismo pallet+cama (y partida si la damos) con position numérica >= newPos
  const candidates = await prisma.ubicacion.findMany({
    where: {
      pallet,
      cama,
      ...(partida ? { partida } : {}),
    },
  });
  const toShift = candidates
    .map((u) => ({ id: u.id, assetTag: u.assetTag, position: u.position, invn: u.inventario }))
    .filter((u) => {
      const n = Number(u.position);
      return isFinite(n) && n >= newPos;
    })
    .sort((a, b) => Number(b.position) - Number(a.position)); // shift desc para evitar colisiones

  const plan = {
    equipmentInfo: {
      assetTag: eq.assetTag, inventario: eq.inventario, ordenDell: eq.ordenDell, po: eq.po,
      posicion_partida_excel: eq.posicion, producto: eq.producto,
    },
    inserting: { assetTag, pallet, cama, position: String(newPos), partida },
    partidaFilter: partida ?? '(sin filtro)',
    inSameLocation: candidates.length,
    willShiftCount: toShift.length,
    shiftSample: toShift.slice(0, 5).map((u) => ({
      assetTag: u.assetTag, inv: u.invn,
      from: u.position, to: String(Number(u.position) + 1),
    })),
  };

  if (dry) return NextResponse.json({ ok: true, dry: true, plan });

  const result = await prisma.$transaction(async (tx) => {
    for (const u of toShift) {
      await tx.ubicacion.update({
        where: { id: u.id },
        data: { position: String(Number(u.position) + 1) },
      });
    }
    const created = await tx.ubicacion.create({
      data: {
        po: eq.po, ordenDell: eq.ordenDell, producto: eq.producto,
        cantidad: eq.cantidadOrden, partida: partida ?? eq.posicion, descripcion: eq.descripcion,
        assetTag: eq.assetTag, inventario: eq.inventario,
        cama, pallet, position: String(newPos),
      },
    });
    return { created, shifted: toShift.length };
  });

  return NextResponse.json({ ok: true, dry: false, plan, result });
}
