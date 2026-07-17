import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { allCellsVertical } from '@/lib/board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reinicia el proceso: pone todos los equipos en PENDING, borra eventos, vacía tablero.
// NO borra el catálogo (equipos siguen).
export async function POST() {
  await prisma.scanEvent.deleteMany();
  await prisma.boardSlot.updateMany({ data: { equipmentId: null, occupiedAt: null } });
  await prisma.equipment.updateMany({
    data: {
      status: 'PENDING',
      boardCell: null,
      taggedAt: null, taggedBy: null,
      pairedAt: null, pairedBy: null,
      labeledAt: null, labeledBy: null,
      matchedAt: null, matchedBy: null,
    },
  });
  // Asegura BoardSlots existan
  for (const c of allCellsVertical()) {
    await prisma.boardSlot.upsert({ where: { cell: c }, create: { cell: c }, update: {} });
  }
  return NextResponse.json({ ok: true });
}
