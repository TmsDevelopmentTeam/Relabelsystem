import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';
import { allCellsVertical } from '@/lib/board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PASO 1: Escanear Asset Tag → asignar a cuadrante libre (llenado vertical A1..A10, B1..B10, …)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const assetTag = norm(body?.assetTag);
    const operator = String(body?.operator ?? 'unknown');
    if (!assetTag) return NextResponse.json({ ok: false, reason: 'MISSING', message: 'Asset Tag vacío' }, { status: 400 });

    const eq = await prisma.equipment.findUnique({ where: { assetTag } });
    if (!eq) {
      await prisma.scanEvent.create({
        data: { step: 'TAG', assetTag, operator, result: 'NOT_FOUND', message: 'Asset Tag no existe' },
      });
      return NextResponse.json({ ok: false, reason: 'NOT_FOUND', message: `Asset Tag ${assetTag} no encontrado` });
    }

    // Si ya tenía cuadrante, devolverlo
    if (eq.boardCell && eq.status !== 'PENDING') {
      await prisma.scanEvent.create({
        data: { step: 'TAG', assetTag, operator, boardCell: eq.boardCell, result: 'DUPLICATE',
                equipmentId: eq.id, message: `Ya estaba en ${eq.boardCell} (${eq.status})` },
      });
      return NextResponse.json({
        ok: true, alreadyPlaced: true, equipment: eq, boardCell: eq.boardCell,
        message: `Ya estaba en cuadrante ${eq.boardCell}`,
      });
    }

    // Buscar cuadrante libre (orden vertical)
    const cells = allCellsVertical();
    const occupied = await prisma.boardSlot.findMany({
      where: { equipmentId: { not: null } },
      select: { cell: true },
    });
    const occupiedSet = new Set(occupied.map((o) => o.cell));
    const freeCell = cells.find((c) => !occupiedSet.has(c));
    if (!freeCell) {
      return NextResponse.json({ ok: false, reason: 'BOARD_FULL', message: 'Tablero lleno. Termina la línea actual antes de agregar más.' });
    }

    const [updated] = await prisma.$transaction([
      prisma.equipment.update({
        where: { id: eq.id },
        data: { status: 'TAG_PLACED', boardCell: freeCell, taggedAt: new Date(), taggedBy: operator },
      }),
      prisma.boardSlot.upsert({
        where: { cell: freeCell },
        create: { cell: freeCell, equipmentId: eq.id, occupiedAt: new Date() },
        update: { equipmentId: eq.id, occupiedAt: new Date() },
      }),
      prisma.scanEvent.create({
        data: { step: 'TAG', assetTag, boardCell: freeCell, operator, result: 'OK', equipmentId: eq.id },
      }),
    ]);

    return NextResponse.json({ ok: true, equipment: updated, boardCell: freeCell });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
