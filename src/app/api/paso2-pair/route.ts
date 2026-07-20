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

    const rollEntry = await prisma.labelRoll.findFirst({
      where: { value: inventarioResolved },
      orderBy: { id: 'asc' },
    });
    const rollPosition = rollEntry?.id ?? null;

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

    return NextResponse.json({
      ok: true,
      equipment: updated,
      rollPosition,
      inventario: inventarioResolved,
      othersWithSameInventario: equipos.length - 1,
      alreadyPaired: !shouldAdvance,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
