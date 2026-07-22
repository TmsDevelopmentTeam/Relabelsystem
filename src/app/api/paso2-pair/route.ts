import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PASO ① UBICAR:
// Escanea Asset Tag (SN Dell) o Inventario (AM/EQR). El sistema:
//   1. Resuelve al equipo del catálogo.
//   2. Busca su inventario en el rollo pre-cargado → devuelve la posición.
//   3. Marca el equipo como PAIR_READY.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scanned = norm(body?.scanned ?? body?.assetTag ?? body?.inventario);
    const operator = String(body?.operator ?? 'unknown');
    if (!scanned) return NextResponse.json({ ok: false, reason: 'MISSING', message: 'Escaneo vacío' }, { status: 400 });

    const isInventario = /^(AM|EQR)/.test(scanned);
    let equipos: any[] = [];
    let inventarioResolved = scanned;

    if (isInventario) {
      equipos = await prisma.equipment.findMany({ where: { inventario: scanned } });
    } else {
      const eq = await prisma.equipment.findUnique({ where: { assetTag: scanned } });
      if (eq) {
        inventarioResolved = eq.inventario;
        equipos = await prisma.equipment.findMany({ where: { inventario: eq.inventario } });
      }
    }

    if (!equipos.length) {
      await prisma.scanEvent.create({
        data: { step: 'PAIR', inventario: scanned, operator, result: 'NOT_FOUND',
                message: `No encontrado como ${isInventario ? 'inventario' : 'asset tag'}` },
      });
      return NextResponse.json({
        ok: false, reason: 'NOT_FOUND',
        message: `${scanned} no encontrado (ni como Asset Tag ni como etiqueta).`,
      });
    }

    let target: any;
    if (!isInventario) {
      target = equipos.find((e) => e.assetTag === scanned) ?? equipos[0];
    } else {
      target = equipos.find((e) => e.status === 'PENDING') ?? equipos[0];
    }

    // Buscar rollo pre-cargado que coincida con la orden del equipo escaneado.
    // Regla ESTRICTA: si el operador escaneó un ASSET TAG (orden única y clara),
    // solo devolvemos rollos de ESA misma orden. NO caemos a otras órdenes
    // porque eso confunde al operador (mismo inventario existe en varias ordenes).
    // Solo si escanearon INVENTARIO puro (isInventario=true, sin contexto de orden)
    // aceptamos cualquier rollo como fallback.
    const equipoOrder = target.ordenDell ?? target.po ?? null;
    let rollEntry = null;
    if (equipoOrder) {
      rollEntry = await prisma.labelRoll.findFirst({
        where: { value: inventarioResolved, orderNumber: equipoOrder },
        orderBy: { position: 'asc' },
      });
    }
    if (!rollEntry && isInventario) {
      // Escaneó inventario sin orden clara → fallback permitido
      rollEntry =
        (await prisma.labelRoll.findFirst({
          where: { value: inventarioResolved, orderNumber: { not: null } },
          orderBy: { id: 'asc' },
        })) ??
        (await prisma.labelRoll.findFirst({
          where: { value: inventarioResolved },
          orderBy: { id: 'asc' },
        }));
    }
    const rollPosition = rollEntry?.position ?? rollEntry?.id ?? null;
    const rollOrder = rollEntry?.orderNumber ?? null;
    // Si escaneó asset tag y no hay rollo en su orden, avisar (rollMissingForOrder=true)
    const rollMissingForOrder = !isInventario && !rollEntry && equipoOrder != null;

    // Marcar como PAIR_READY (si estaba PENDING). No bloquear si ya avanzó.
    const shouldAdvance = target.status === 'PENDING';
    let updated = target;

    if (shouldAdvance) {
      updated = await prisma.equipment.update({
        where: { id: target.id },
        data: { status: 'PAIR_READY', pairedAt: new Date(), pairedBy: operator },
      });
    }

    await prisma.scanEvent.create({
      data: { step: 'PAIR', inventario: inventarioResolved, operator,
              result: 'OK', equipmentId: target.id,
              message: rollPosition ? `Rollo #${rollPosition}` : 'Sin rollo pre-cargado' },
    });

    // Lookup opcional en Ubicacion (módulo Cama) — solo lectura, no modifica nada
    const ubicacion = await prisma.ubicacion
      .findFirst({
        where: {
          OR: [{ assetTag: target.assetTag }, { inventario: inventarioResolved }],
        },
        select: { cama: true, position: true, pallet: true, partida: true },
      })
      .catch(() => null);

    return NextResponse.json({
      ok: true,
      equipment: updated,
      rollPosition,
      rollOrder,
      rollMissingForOrder,
      equipoOrder,
      inventario: inventarioResolved,
      othersWithSameInventario: equipos.length - 1,
      alreadyPaired: !shouldAdvance,
      ubicacion, // { cama, position, pallet, partida } o null si no está en Cama
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
