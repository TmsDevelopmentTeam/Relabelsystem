import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esLaptop = (p: string | null) => /pro 14|pc14250|laptop/i.test(String(p ?? ''));
// Clave de rollo por pallet: "PARTIDA · P#". paso2 arma la misma cadena para
// resolver el rollo del equipo escaneado.
export const palletKey = (partida: string, pallet: string) => `${partida} · P${pallet}`;

const numOr = (v: string | null) => {
  const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
};

// Devuelve cuántas etiquetas se esperan y cuántas van escaneadas.
// Modos:
//   ?order=1031...            → por orden (Equipment)
//   ?partida=1520 D           → lista los PALLETS de esa partida (para elegir)
//   ?partida=1520 D&pallet=1  → por PALLET (rollos nuevos: tarima+pallet)
export async function GET(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order')?.trim();
  let partida = req.nextUrl.searchParams.get('partida')?.trim();
  let pallet = req.nextUrl.searchParams.get('pallet')?.trim();
  // Si 'order' viene como clave compuesta "PARTIDA · P#", tratar como pallet.
  if (order && !partida) {
    const m = order.match(/^(.+) · P(.+)$/);
    if (m) { partida = m[1]; pallet = m[2]; }
  }

  // --- Modo PALLET (partida + pallet) ---
  if (partida && pallet) {
    const ubis = await prisma.ubicacion.findMany({
      where: { partida, pallet }, select: { producto: true },
    });
    const laptopCount = ubis.filter((u) => esLaptop(u.producto)).length;
    const otherCount = ubis.length - laptopCount;
    const expectedLabels = laptopCount * 2 + otherCount * 1;
    const key = palletKey(partida, pallet);
    const rollAll = await prisma.labelRoll.findMany({ where: { orderNumber: key }, select: { value: true } });
    const scannedInRoll = rollAll.length;
    const scannedEquipos = new Set(rollAll.map((r) => r.value)).size;
    return NextResponse.json({
      order: key, modo: 'pallet', partida, pallet,
      equipmentCount: ubis.length, laptopCount, otherCount, expectedLabels,
      scannedInRoll, scannedEquipos,
      remainingEquipos: Math.max(ubis.length - scannedEquipos, 0),
      completedPctEquipos: ubis.length ? Math.min(100, Math.round((scannedEquipos / ubis.length) * 100)) : 0,
      remaining: Math.max(expectedLabels - scannedInRoll, 0),
      completedPct: expectedLabels ? Math.min(100, Math.round((scannedInRoll / expectedLabels) * 100)) : 0,
      complete: scannedInRoll >= expectedLabels && expectedLabels > 0,
    });
  }

  // --- Modo PARTIDA (solo lista de pallets para elegir) ---
  if (partida && !pallet) {
    const ubis = await prisma.ubicacion.findMany({ where: { partida }, select: { pallet: true, producto: true } });
    const byPallet = new Map<string, number>();
    for (const u of ubis) { const p = String(u.pallet ?? '?'); byPallet.set(p, (byPallet.get(p) ?? 0) + 1); }
    const pallets = Array.from(byPallet.entries())
      .map(([p, count]) => ({ pallet: p, count }))
      .sort((a, b) => numOr(a.pallet) - numOr(b.pallet));
    return NextResponse.json({ modo: 'partida-lista', partida, equipmentCount: ubis.length, pallets });
  }

  // --- Modo ORDEN (Equipment) ---
  if (!order) return NextResponse.json({ error: 'falta ?order o ?partida' }, { status: 400 });
  const equipos = await prisma.equipment.findMany({
    where: { OR: [{ ordenDell: order }, { po: order }] },
    select: { equipmentType: true },
  });
  const equipmentCount = equipos.length;
  const laptopCount = equipos.filter((e) => e.equipmentType === 'LAPTOP').length;
  const otherCount = equipmentCount - laptopCount;
  const expectedLabels = laptopCount * 2 + otherCount * 1;
  const rollAll = await prisma.labelRoll.findMany({ where: { orderNumber: order }, select: { value: true } });
  const scannedInRoll = rollAll.length;
  const scannedEquipos = new Set(rollAll.map((r) => r.value)).size;
  return NextResponse.json({
    order, modo: 'orden', equipmentCount, laptopCount, otherCount, expectedLabels,
    scannedInRoll, scannedEquipos,
    remainingEquipos: Math.max(equipmentCount - scannedEquipos, 0),
    completedPctEquipos: equipmentCount > 0 ? Math.min(100, Math.round((scannedEquipos / equipmentCount) * 100)) : 0,
    remaining: Math.max(expectedLabels - scannedInRoll, 0),
    completedPct: expectedLabels > 0 ? Math.min(100, Math.round((scannedInRoll / expectedLabels) * 100)) : 0,
    complete: scannedInRoll >= expectedLabels && expectedLabels > 0,
  });
}
