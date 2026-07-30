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

  // Si el valor no es una orden, se intenta como PARTIDA (Ubicacion.partida).
  // Los rollos ahora llegan por partida (ej. "1520 D"): se cuenta desde Cama.
  const esLaptop = (p: string | null) => /pro 14|pc14250|laptop/i.test(String(p ?? ''));
  let modo = 'orden';
  let equipmentCount: number, laptopCount: number, otherCount: number;
  if (equipos.length > 0) {
    equipmentCount = equipos.length;
    laptopCount = equipos.filter((e) => e.equipmentType === 'LAPTOP').length;
    otherCount = equipmentCount - laptopCount;
  } else {
    const ubis = await prisma.ubicacion.findMany({ where: { partida: order }, select: { producto: true } });
    if (ubis.length > 0) {
      modo = 'partida';
      equipmentCount = ubis.length;
      laptopCount = ubis.filter((u) => esLaptop(u.producto)).length;
      otherCount = equipmentCount - laptopCount;
    } else {
      equipmentCount = 0; laptopCount = 0; otherCount = 0;
    }
  }
  const expectedLabels = laptopCount * 2 + otherCount * 1;

  const rollAll = await prisma.labelRoll.findMany({
    where: { orderNumber: order },
    select: { value: true },
  });
  const scannedInRoll = rollAll.length;

  // El operador cuenta EQUIPOS, no etiquetas. Una laptop lleva 2 etiquetas
  // repetidas (mismo inventario), así que 96 etiquetas = 48 equipos.
  const scannedEquipos = new Set(rollAll.map((r) => r.value)).size;

  return NextResponse.json({
    order,
    modo,
    equipmentCount,
    laptopCount,
    otherCount,
    expectedLabels,
    scannedInRoll,
    scannedEquipos,
    remainingEquipos: Math.max(equipmentCount - scannedEquipos, 0),
    completedPctEquipos: equipmentCount > 0 ? Math.min(100, Math.round((scannedEquipos / equipmentCount) * 100)) : 0,
    remaining: Math.max(expectedLabels - scannedInRoll, 0),
    completedPct: expectedLabels > 0 ? Math.min(100, Math.round((scannedInRoll / expectedLabels) * 100)) : 0,
    complete: scannedInRoll >= expectedLabels && expectedLabels > 0,
  });
}
