import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Escanea Serie (assetTag) o Inventario. Devuelve Cama/Position/Pallet.
// Ademas MARCA en BD que este assetTag ya fue escaneado (scannedAt/By).
async function doLookup(scanRaw: string, operator: string) {
  const scan = norm(scanRaw);
  if (!scan) return { ok: false, message: 'Falta scan' };

  const isInventario = /^(AM|EQR)/.test(scan);
  let u = null;
  if (isInventario) {
    u = await prisma.ubicacion.findFirst({ where: { inventario: scan } });
  } else {
    u = await prisma.ubicacion.findUnique({ where: { assetTag: scan } });
  }
  if (!u) return { ok: false, reason: 'NOT_FOUND', message: `${scan} no encontrado en el catálogo de ubicaciones.` };

  // Persistir el scan (si no estaba ya escaneado)
  if (!u.scannedAt) {
    u = await prisma.ubicacion.update({
      where: { id: u.id },
      data: { scannedAt: new Date(), scannedBy: operator || null },
    });
  }

  return {
    ok: true,
    assetTag: u.assetTag,
    inventario: u.inventario,
    cama: u.cama,
    position: u.position,
    pallet: u.pallet,
    ordenDell: u.ordenDell,
    po: u.po,
    producto: u.producto,
    partida: u.partida,
    scannedAt: u.scannedAt,
  };
}

export async function GET(req: NextRequest) {
  const scan = req.nextUrl.searchParams.get('scan') ?? '';
  const operator = req.nextUrl.searchParams.get('operator') ?? '';
  const res = await doLookup(scan, operator);
  return NextResponse.json(res);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await doLookup(String(body?.scan ?? ''), String(body?.operator ?? ''));
  return NextResponse.json(res);
}
