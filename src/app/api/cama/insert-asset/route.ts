import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Inserta un asset del catálogo Equipment en Ubicacion, respetando el orden por
// inventario dentro de su partida. Recorre las positions posteriores en la
// misma partida + pallet + cama.
//
// Query params:
//   assetTag=X   → el asset a insertar
//   dry=1        → solo diagnostica, no inserta ni modifica
//
// Estrategia:
//   1. Encuentra el equipo en Equipment (assetTag, inventario, orden, partida)
//   2. Verifica que NO exista ya en Ubicacion
//   3. Encuentra los vecinos en Ubicacion con la misma ordenDell y agrupados por
//      partida (usa Equipment.posicion como partida)
//   4. Determina la position donde insertar según inventario ASC
//   5. dry=1: reporta lo que haría · dry=0: ejecuta transacción
export async function POST(req: NextRequest) {
  const assetTag = norm(req.nextUrl.searchParams.get('assetTag'));
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  if (!assetTag) return NextResponse.json({ error: 'falta ?assetTag' }, { status: 400 });

  const eq = await prisma.equipment.findUnique({ where: { assetTag } });
  if (!eq) return NextResponse.json({ ok: false, reason: 'NOT_IN_EQUIPMENT', message: 'Asset no existe en el catálogo principal' });

  // ¿Ya está en Ubicacion?
  const existing = await prisma.ubicacion.findUnique({ where: { assetTag } });
  if (existing) {
    return NextResponse.json({
      ok: false, reason: 'ALREADY_IN_UBICACION',
      message: 'Este asset ya está en el catálogo de ubicaciones',
      existing,
    });
  }

  const targetPartida = eq.posicion ?? null; // "1570" en este caso
  const targetOrden = eq.ordenDell ?? eq.po ?? null;

  // Vecinos: mismos ordenDell + partida
  const neighbors = await prisma.ubicacion.findMany({
    where: {
      partida: targetPartida ?? undefined,
      OR: [{ ordenDell: targetOrden ?? undefined }, { po: targetOrden ?? undefined }],
    },
    orderBy: { inventario: 'asc' },
  });

  // Si no hay vecinos en la misma partida+orden, mostrar contexto amplio
  const alternates = neighbors.length === 0
    ? await prisma.ubicacion.findMany({
        where: { partida: targetPartida ?? undefined },
        orderBy: { inventario: 'asc' },
      })
    : [];

  // Determinar la posición donde debe caer (por inventario ASC)
  let insertAt = -1;
  for (let i = 0; i < neighbors.length; i++) {
    if (neighbors[i].inventario > eq.inventario) { insertAt = i; break; }
  }
  if (insertAt === -1) insertAt = neighbors.length; // va al final

  // Datos del vecino donde caería (pallet/cama heredados del anterior o del siguiente)
  const prev = insertAt > 0 ? neighbors[insertAt - 1] : null;
  const next = insertAt < neighbors.length ? neighbors[insertAt] : null;
  const heredaPallet = prev?.pallet ?? next?.pallet ?? null;
  const heredaCama = prev?.cama ?? next?.cama ?? null;

  // Position: la del next (si existe) o la del prev+1
  let newPosition: string | null = null;
  if (next?.position) newPosition = next.position;
  else if (prev?.position) {
    const n = Number(prev.position);
    if (!isNaN(n)) newPosition = String(n + 1);
    else newPosition = prev.position;
  }

  // Positions a recorrer (numericamente): todas las de neighbors[insertAt..end] con position numérica
  const toShift = neighbors.slice(insertAt).filter((u) => {
    const n = Number(u.position);
    return !isNaN(n);
  });

  const plan = {
    equipmentInfo: {
      assetTag: eq.assetTag, inventario: eq.inventario,
      ordenDell: eq.ordenDell, po: eq.po,
      posicion_partida: eq.posicion, producto: eq.producto,
    },
    neighborsInSameOrderAndPartida: neighbors.length,
    neighborsSample: neighbors.slice(Math.max(0, insertAt - 3), Math.min(neighbors.length, insertAt + 3)).map((n) => ({
      inv: n.inventario, asset: n.assetTag, pallet: n.pallet, cama: n.cama, position: n.position,
    })),
    alternates: alternates.length ? `partida ${targetPartida} tiene ${alternates.length} registros con OTRAS ordenes` : null,
    insertAt,
    prev: prev ? { inv: prev.inventario, position: prev.position, pallet: prev.pallet, cama: prev.cama } : null,
    next: next ? { inv: next.inventario, position: next.position, pallet: next.pallet, cama: next.cama } : null,
    proposal: {
      pallet: heredaPallet, cama: heredaCama, position: newPosition,
      partida: targetPartida,
    },
    willShiftCount: toShift.length,
  };

  if (dry) return NextResponse.json({ ok: true, dry: true, plan });

  // Ejecutar la inserción con shift
  if (neighbors.length === 0 && alternates.length === 0) {
    return NextResponse.json({
      ok: false, reason: 'NO_PARTIDA_CONTEXT',
      message: `La partida ${targetPartida} no tiene registros previos en Ubicacion. Aborto para no crear datos aislados.`,
      plan,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Recorrer positions (numéricas) de todos los siguientes en la misma orden+partida
    for (const u of toShift) {
      const n = Number(u.position);
      await tx.ubicacion.update({
        where: { id: u.id },
        data: { position: String(n + 1) },
      });
    }
    // Insertar el nuevo
    const created = await tx.ubicacion.create({
      data: {
        po: eq.po, ordenDell: eq.ordenDell, producto: eq.producto,
        cantidad: eq.cantidadOrden, partida: targetPartida,
        descripcion: eq.descripcion,
        assetTag: eq.assetTag, inventario: eq.inventario,
        cama: heredaCama, pallet: heredaPallet, position: newPosition,
      },
    });
    return { created, shifted: toShift.length };
  });

  return NextResponse.json({ ok: true, dry: false, plan, result });
}
