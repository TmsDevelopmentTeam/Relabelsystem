import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Devuelve cuántas etiquetas físicas se esperan para una orden Dell,
// comparadas con las que ya se escanearon en el rollo.
//
// La orden puede matchearse contra Equipment.ordenDell O Equipment.po
// (según cómo el usuario capture el número).
//
// # de etiquetas físicas esperadas:
//   Cada equipo lleva 1 etiqueta (monitor, CPU) o 2 etiquetas (laptop).
//   Total = suma por equipo de la orden.
export async function GET(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order')?.trim();
  if (!order) return NextResponse.json({ error: 'falta ?order' }, { status: 400 });

  const equipos = await prisma.equipment.findMany({
    where: { OR: [{ ordenDell: order }, { po: order }] },
    select: { id: true, assetTag: true, inventario: true, equipmentType: true },
  });

  const equipmentCount = equipos.length;
  const laptopCount = equipos.filter((e) => e.equipmentType === 'LAPTOP').length;
  const otherCount = equipmentCount - laptopCount;
  const expectedLabels = laptopCount * 2 + otherCount * 1;

  const scannedInRoll = await prisma.labelRoll.count({ where: { orderNumber: order } });

  return NextResponse.json({
    order,
    equipmentCount,
    laptopCount,
    otherCount,
    expectedLabels,
    scannedInRoll,
    remaining: Math.max(expectedLabels - scannedInRoll, 0),
    completedPct: expectedLabels > 0 ? Math.min(100, Math.round((scannedInRoll / expectedLabels) * 100)) : 0,
    complete: scannedInRoll >= expectedLabels && expectedLabels > 0,
  });
}
