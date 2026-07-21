import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Escanea Serie (assetTag) o Inventario. Devuelve Cama/Position/Pallet + info.
export async function GET(req: NextRequest) {
  const scan = norm(req.nextUrl.searchParams.get('scan'));
  if (!scan) return NextResponse.json({ ok: false, message: 'Falta scan' }, { status: 400 });

  // Detectar si es inventario (AM/EQR) o asset tag
  const isInventario = /^(AM|EQR)/.test(scan);
  let u = null;
  if (isInventario) {
    u = await prisma.ubicacion.findFirst({ where: { inventario: scan } });
  } else {
    u = await prisma.ubicacion.findUnique({ where: { assetTag: scan } });
  }
  if (!u) {
    return NextResponse.json({ ok: false, reason: 'NOT_FOUND', message: `${scan} no encontrado en el catálogo de ubicaciones.` });
  }

  return NextResponse.json({
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
  });
}
