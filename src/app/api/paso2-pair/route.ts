import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PASO 2: Escanear etiqueta GRANDE (número de INVENTARIO / activo fijo).
// El sistema encuentra a qué Asset Tag corresponde y en qué cuadrante está.
// Marca el equipo como PAIR_READY.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inventario = norm(body?.inventario);
    const operator = String(body?.operator ?? 'unknown');
    if (!inventario) return NextResponse.json({ ok: false, reason: 'MISSING', message: 'Etiqueta vacía' }, { status: 400 });

    // Buscar equipos con este inventario (puede haber 2: Monitor + CPU comparten activo)
    const equipos = await prisma.equipment.findMany({ where: { inventario } });
    if (!equipos.length) {
      await prisma.scanEvent.create({
        data: { step: 'PAIR', inventario, operator, result: 'NOT_FOUND', message: 'Inventario no existe' },
      });
      return NextResponse.json({ ok: false, reason: 'NOT_FOUND', message: `Etiqueta ${inventario} no encontrada` });
    }

    // Filtrar: solo los que ya tienen cuadrante asignado (paso 1 hecho)
    const withCell = equipos.filter((e) => e.boardCell && (e.status === 'TAG_PLACED' || e.status === 'PAIR_READY'));

    if (!withCell.length) {
      await prisma.scanEvent.create({
        data: { step: 'PAIR', inventario, operator, result: 'ERROR', equipmentId: equipos[0].id,
                message: 'Ningún equipo con este inventario está en el tablero (paso 1 pendiente)' },
      });
      return NextResponse.json({
        ok: false, reason: 'NO_TAG_PLACED',
        message: `Ningún equipo con etiqueta ${inventario} está en el tablero. Haz primero el paso 1 (Asset Tag).`,
      });
    }

    // Elegir el primero que aún no esté emparejado (o si todos están, indicar duplicado)
    const target = withCell.find((e) => e.status === 'TAG_PLACED') ?? withCell[0];
    const alreadyPaired = target.status === 'PAIR_READY';

    if (alreadyPaired) {
      await prisma.scanEvent.create({
        data: { step: 'PAIR', inventario, boardCell: target.boardCell, operator, result: 'DUPLICATE',
                equipmentId: target.id, message: 'Ya estaba emparejada' },
      });
      return NextResponse.json({
        ok: true, alreadyPaired: true, equipment: target, boardCell: target.boardCell!,
        message: `Ya estaba emparejada en ${target.boardCell}`,
      });
    }

    const [updated] = await prisma.$transaction([
      prisma.equipment.update({
        where: { id: target.id },
        data: { status: 'PAIR_READY', pairedAt: new Date(), pairedBy: operator },
      }),
      prisma.scanEvent.create({
        data: { step: 'PAIR', inventario, boardCell: target.boardCell, operator, result: 'OK', equipmentId: target.id },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      equipment: updated,
      boardCell: target.boardCell!,
      othersWithSameInventario: withCell.length - 1,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
