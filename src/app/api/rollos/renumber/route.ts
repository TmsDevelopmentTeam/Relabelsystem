import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Renumera los IDs de LabelRoll a 1..N conservando el orden de createdAt.
// NO borra valores, solo renumera. Útil cuando los IDs quedaron "huecos" por deletes.
export async function POST() {
  const items = await prisma.labelRoll.findMany({ orderBy: { createdAt: 'asc' } });

  // Estrategia SQLite: usar una tabla temporal, insertar con nuevos IDs, luego swap.
  // Como Prisma no soporta bien esto multiplataforma, lo hago con un enfoque
  // seguro: borrar todos, resetear el sequence, re-insertar en orden.
  const values = items.map((i) => ({
    value: i.value,
    status: i.status,
    operator: i.operator,
    createdAt: i.createdAt,
    consumedAt: i.consumedAt,
    consumedBy: i.consumedBy,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.labelRoll.deleteMany();
    // Reset del autoincrement en SQLite
    await tx.$executeRawUnsafe(`DELETE FROM sqlite_sequence WHERE name = 'LabelRoll'`).catch(() => {});
    // Re-insertar uno por uno en orden — createMany no garantiza orden en SQLite
    for (const v of values) {
      await tx.labelRoll.create({ data: v });
    }
  });

  const total = await prisma.labelRoll.count();
  const first = await prisma.labelRoll.findFirst({ orderBy: { id: 'asc' } });
  const last = await prisma.labelRoll.findFirst({ orderBy: { id: 'desc' } });

  return NextResponse.json({
    ok: true,
    total,
    firstId: first?.id ?? null,
    lastId: last?.id ?? null,
  });
}
