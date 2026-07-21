import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lista todas las órdenes con sus assetTags. El frontend cruza con la sesión
// de scans para saber cuántos van escaneados por orden.
export async function GET() {
  const all = await prisma.ubicacion.findMany({
    select: { assetTag: true, ordenDell: true, po: true, cama: true, position: true, pallet: true },
  });
  const map = new Map<string, string[]>();
  for (const u of all) {
    const key = u.ordenDell ?? u.po ?? '(sin orden)';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(u.assetTag);
  }
  const orders = [...map.entries()]
    .map(([orderNumber, assetTags]) => ({ orderNumber, total: assetTags.length, assetTags }))
    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  return NextResponse.json({ orders, totalOrders: orders.length });
}
