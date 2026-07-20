import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Escanea Asset Tag. Devuelve la posición 1..N ordenando los equipos de su
// orden por INVENTARIO (AM/EQR) ascendente. 1 = inventario más bajo, N = más alto.
//
// Ejemplo: orden 1031673969 tiene 100 monitores con inventarios
// AM2150010852..AM2150010951. Si escaneas el Asset Tag cuyo inventario es
// AM2150010900 → posición 49 de 100.
export async function GET(req: NextRequest) {
  const assetTag = norm(req.nextUrl.searchParams.get('assetTag'));
  const expectedOrder = req.nextUrl.searchParams.get('order')?.trim() || null;
  if (!assetTag) return NextResponse.json({ ok: false, message: 'Falta assetTag' }, { status: 400 });

  const eq = await prisma.equipment.findUnique({
    where: { assetTag },
    select: { assetTag: true, inventario: true, producto: true, equipmentType: true, ordenDell: true, po: true },
  });
  if (!eq) {
    return NextResponse.json({ ok: false, reason: 'NOT_FOUND', message: `Asset Tag ${assetTag} no existe.` });
  }

  const orderNumber = eq.ordenDell ?? eq.po ?? null;
  if (!orderNumber) {
    return NextResponse.json({ ok: false, reason: 'NO_ORDER', message: 'El equipo no tiene orden Dell ni PO.' });
  }

  // Validar que la orden esperada coincida con la orden real del equipo
  if (expectedOrder && orderNumber !== expectedOrder) {
    return NextResponse.json({
      ok: false,
      reason: 'WRONG_ORDER',
      message: `Este equipo pertenece a la orden ${orderNumber}, no a ${expectedOrder}.`,
      assetTag: eq.assetTag,
      inventario: eq.inventario,
      producto: eq.producto,
      equipmentType: eq.equipmentType,
      realOrder: orderNumber,
      expectedOrder,
    });
  }

  const siblings = await prisma.equipment.findMany({
    where: { OR: [{ ordenDell: orderNumber }, { po: orderNumber }] },
    orderBy: { inventario: 'asc' },
    select: { assetTag: true, inventario: true },
  });

  const position = siblings.findIndex((s) => s.assetTag === assetTag) + 1;
  const totalInOrder = siblings.length;

  return NextResponse.json({
    ok: true,
    assetTag: eq.assetTag,
    inventario: eq.inventario,
    producto: eq.producto,
    equipmentType: eq.equipmentType,
    orderNumber,
    position,
    totalInOrder,
    firstInventario: siblings[0]?.inventario ?? null,
    lastInventario: siblings[siblings.length - 1]?.inventario ?? null,
  });
}
