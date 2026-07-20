import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PASO 2: Escanear ASSET TAG (SN Dell tipo 1NZX0K4) o ETIQUETA GRANDE (AM2150…/EQR…).
// El sistema encuentra a qué equipo corresponde y en qué posición del rollo está su etiqueta.
// Marca el equipo como PAIR_READY.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Aceptamos scan como `assetTag` o `inventario` (compat) o `scanned` (nombre genérico)
    const scanned = norm(body?.scanned ?? body?.assetTag ?? body?.inventario);
    const operator = String(body?.operator ?? 'unknown');
    if (!scanned) return NextResponse.json({ ok: false, reason: 'MISSING', message: 'Escaneo vacío' }, { status: 400 });

    // Detectar si es Asset Tag (formato Dell, no empieza con AM/EQR) o INVENTARIO
    const isInventario = /^(AM|EQR)/.test(scanned);

    let equipos: any[] = [];
    let inventarioResolved = scanned;

    if (isInventario) {
      // Búsqueda directa por inventario (puede haber 2: Monitor + CPU comparten activo)
      equipos = await prisma.equipment.findMany({ where: { inventario: scanned } });
    } else {
      // Es Asset Tag → busco el equipo y de ahí saco su inventario
      const eq = await prisma.equipment.findUnique({ where: { assetTag: scanned } });
      if (eq) {
        inventarioResolved = eq.inventario;
        // Traigo también los otros equipos que comparten inventario (para mostrar el conteo)
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

    // Elegir el target: el que hicimos scan directo (si asset tag) o el primero pendiente
    let target: any;
    if (!isInventario) {
      target = equipos.find((e) => e.assetTag === scanned) ?? equipos[0];
    } else {
      target = equipos.find((e) => e.status !== 'PAIR_READY' && e.status !== 'LABELED' && e.status !== 'MATCHED') ?? equipos[0];
    }

    const alreadyPaired = target.status === 'PAIR_READY' || target.status === 'LABELED' || target.status === 'MATCHED';

    // Buscar la etiqueta en el rollo (por el inventario resuelto)
    const rollEntry = await prisma.labelRoll.findFirst({
      where: { value: inventarioResolved },
      orderBy: { id: 'asc' },
    });
    const rollPosition = rollEntry?.id ?? null;

    if (alreadyPaired) {
      await prisma.scanEvent.create({
        data: { step: 'PAIR', inventario: inventarioResolved, boardCell: target.boardCell, operator,
                result: 'DUPLICATE', equipmentId: target.id, message: `Ya estaba ${target.status}` },
      });
      return NextResponse.json({
        ok: true, alreadyPaired: true, equipment: target,
        boardCell: target.boardCell ?? null,
        rollPosition, inventario: inventarioResolved,
        message: `Este equipo ya estaba en estado ${target.status}`,
      });
    }

    const [updated] = await prisma.$transaction([
      prisma.equipment.update({
        where: { id: target.id },
        data: { status: 'PAIR_READY', pairedAt: new Date(), pairedBy: operator },
      }),
      prisma.scanEvent.create({
        data: { step: 'PAIR', inventario: inventarioResolved, boardCell: target.boardCell, operator,
                result: 'OK', equipmentId: target.id },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      equipment: updated,
      boardCell: target.boardCell ?? null,
      rollPosition,
      inventario: inventarioResolved,
      othersWithSameInventario: equipos.length - 1,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
