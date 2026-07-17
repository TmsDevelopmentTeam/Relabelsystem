import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { BOARD_COLS, BOARD_ROWS, boardMatrix } from '@/lib/board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const slots = await prisma.boardSlot.findMany();
  const occupied = slots.filter((s) => s.equipmentId != null);
  const eqs = await prisma.equipment.findMany({
    where: { id: { in: occupied.map((s) => s.equipmentId!) } },
    select: { id: true, assetTag: true, inventario: true, producto: true, equipmentType: true, status: true },
  });
  const byId = new Map(eqs.map((e) => [e.id, e]));

  const matrix = boardMatrix().map((row) =>
    row.map((cellName) => {
      const slot = slots.find((s) => s.cell === cellName);
      const eq = slot?.equipmentId ? byId.get(slot.equipmentId) : null;
      return {
        cell: cellName,
        occupied: !!eq,
        equipment: eq ?? null,
      };
    }),
  );

  return NextResponse.json({
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
    matrix,
    occupiedCount: occupied.length,
    freeCount: BOARD_COLS * BOARD_ROWS - occupied.length,
  });
}
