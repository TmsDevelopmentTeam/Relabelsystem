import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lista todas las órdenes con sus assetTags. Incluye ahora scannedAssetTags
// (los que ya se escanearon en /cama y quedaron persistidos en BD).
export async function GET() {
  const all = await prisma.ubicacion.findMany({
    select: { assetTag: true, ordenDell: true, po: true, scannedAt: true },
  });
  const map = new Map<string, { assetTags: string[]; scanned: string[] }>();
  for (const u of all) {
    const key = u.ordenDell ?? u.po ?? '(sin orden)';
    if (!map.has(key)) map.set(key, { assetTags: [], scanned: [] });
    const entry = map.get(key)!;
    entry.assetTags.push(u.assetTag);
    if (u.scannedAt) entry.scanned.push(u.assetTag);
  }
  const orders = [...map.entries()]
    .map(([orderNumber, { assetTags, scanned }]) => ({
      orderNumber,
      total: assetTags.length,
      scannedCount: scanned.length,
      assetTags,
      scannedAssetTags: scanned,
    }))
    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  return NextResponse.json({ orders, totalOrders: orders.length });
}
