import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Migra los LabelRoll que tienen orderNumber=null:
//   1. Para cada uno, busca en Equipment por value=inventario → obtiene ordenDell
//   2. Le asigna ese orderNumber y calcula position dentro de la orden
// Si no encuentra equipo, deja el registro sin orden (queda como "huérfano").
export async function POST() {
  const orphans = await prisma.labelRoll.findMany({
    where: { orderNumber: null },
    orderBy: { createdAt: 'asc' },
  });

  let migrated = 0;
  const skipped: string[] = [];
  const perOrderCounters: Record<string, number> = {};

  // Precalcula el max(position) actual de cada orden que ya exista
  const existingOrders = await prisma.labelRoll.groupBy({
    by: ['orderNumber'],
    where: { orderNumber: { not: null } },
    _max: { position: true },
  });
  for (const row of existingOrders) {
    if (row.orderNumber) perOrderCounters[row.orderNumber] = row._max.position ?? 0;
  }

  for (const o of orphans) {
    const eq = await prisma.equipment.findFirst({
      where: { inventario: o.value },
      select: { ordenDell: true, po: true },
    });
    const orden = eq?.ordenDell ?? eq?.po ?? null;
    if (!orden) { skipped.push(o.value); continue; }

    perOrderCounters[orden] = (perOrderCounters[orden] ?? 0) + 1;
    await prisma.labelRoll.update({
      where: { id: o.id },
      data: { orderNumber: orden, position: perOrderCounters[orden] },
    });
    migrated++;
  }

  return NextResponse.json({
    ok: true,
    migrated,
    skipped: skipped.length,
    skippedSample: skipped.slice(0, 5),
  });
}
