import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Escanea Asset Tag (SN Dell). Devuelve la posición del ROLLO pre-escaneado
// dentro de la orden del equipo. Es decir, #1..#N según cómo se escanearon
// los rollos en /rollos (LabelRoll.position).
//
// Ejemplo: Asset CVYPSC4 → inventario AM2150010900, orden 1031673962.
// Si en /rollos ya se escanearon 100 etiquetas de esa orden en cierto orden,
// devuelve la position que le corresponde a AM2150010900 en LabelRoll.
export async function GET(req: NextRequest) {
  const assetTag = norm(req.nextUrl.searchParams.get('assetTag'));
  if (!assetTag) return NextResponse.json({ ok: false, message: 'Falta assetTag' }, { status: 400 });

  const eq = await prisma.equipment.findUnique({
    where: { assetTag },
    select: { assetTag: true, inventario: true, producto: true, equipmentType: true, ordenDell: true, po: true },
  });
  if (!eq) {
    return NextResponse.json({ ok: false, reason: 'NOT_FOUND', message: `Asset Tag ${assetTag} no existe.` });
  }

  const orderNumber = eq.ordenDell ?? eq.po ?? null;

  // Buscar la etiqueta en LabelRoll (preferentemente en la orden del equipo)
  let rollEntry = null;
  if (orderNumber) {
    rollEntry = await prisma.labelRoll.findFirst({
      where: { value: eq.inventario, orderNumber },
      orderBy: { position: 'asc' },
    });
  }
  if (!rollEntry) {
    // Fallback: buscar en cualquier orden
    rollEntry = await prisma.labelRoll.findFirst({
      where: { value: eq.inventario },
      orderBy: { position: 'asc' },
    });
  }

  const totalInOrder = orderNumber
    ? await prisma.labelRoll.count({ where: { orderNumber } })
    : 0;

  if (!rollEntry) {
    return NextResponse.json({
      ok: false,
      reason: 'NOT_IN_ROLL',
      message: `La etiqueta ${eq.inventario} de este equipo aún no está escaneada en el rollo. Ve a 🎞️ Rollos y escánenla primero.`,
      assetTag: eq.assetTag,
      inventario: eq.inventario,
      producto: eq.producto,
      equipmentType: eq.equipmentType,
      orderNumber,
      totalInOrder,
    });
  }

  return NextResponse.json({
    ok: true,
    assetTag: eq.assetTag,
    inventario: eq.inventario,
    producto: eq.producto,
    equipmentType: eq.equipmentType,
    orderNumber,
    rollOrder: rollEntry.orderNumber,
    position: rollEntry.position ?? null,
    totalInOrder,
  });
}
