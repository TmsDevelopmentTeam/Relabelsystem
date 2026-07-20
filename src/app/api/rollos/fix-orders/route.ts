import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reasigna cada LabelRoll a su orderNumber CORRECTO según Equipment.
// Si la etiqueta existe en la orden actual del rollo, se deja (es válida).
// Si NO existe en la orden actual, se mueve a alguna orden donde SÍ exista.
//
// Devuelve: { moved, unchanged, orphans }
export async function POST() {
  const rollos = await prisma.labelRoll.findMany({ orderBy: { createdAt: 'asc' } });

  let moved = 0;
  let unchanged = 0;
  const orphans: string[] = [];

  for (const r of rollos) {
    // ¿La etiqueta ya está en la orden correcta? (si aparece en Equipment con esa orden)
    if (r.orderNumber) {
      const inThisOrder = await prisma.equipment.findFirst({
        where: {
          inventario: r.value,
          OR: [{ ordenDell: r.orderNumber }, { po: r.orderNumber }],
        },
        select: { id: true },
      });
      if (inThisOrder) { unchanged++; continue; }
    }
    // No estaba en la orden correcta → buscar alguna orden donde sí exista
    const eq = await prisma.equipment.findFirst({
      where: { inventario: r.value },
      select: { ordenDell: true, po: true },
    });
    const real = eq?.ordenDell ?? eq?.po ?? null;
    if (!real) { orphans.push(r.value); continue; }
    await prisma.labelRoll.update({
      where: { id: r.id },
      data: { orderNumber: real },
    });
    moved++;
  }

  // Recalcular positions por orden (createdAt asc)
  const distinctOrders = await prisma.labelRoll.findMany({
    distinct: ['orderNumber'],
    select: { orderNumber: true },
  });
  for (const { orderNumber } of distinctOrders) {
    if (orderNumber == null) continue;
    const items = await prisma.labelRoll.findMany({
      where: { orderNumber },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    for (let i = 0; i < items.length; i++) {
      await prisma.labelRoll.update({ where: { id: items[i].id }, data: { position: i + 1 } });
    }
  }

  return NextResponse.json({
    ok: true,
    moved,
    unchanged,
    orphansCount: orphans.length,
    orphansSample: orphans.slice(0, 10),
  });
}
