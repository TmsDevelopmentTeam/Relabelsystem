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

  // Info del PALLET al que pertenece esta caja: total de piezas y posición más
  // alta, para el mismo producto (monitores y CPUs se cuentan por separado).
  // Sirve para avisar al operador cuántas piezas trae ese pallet (unos son de
  // 72, otros de 50, etc.) y con qué número EMPEZAR a armar (la más alta abajo).
  let palletTotal: number | null = null;
  let palletMaxPos: number | null = null;
  if (u.pallet != null) {
    const hermanos = await prisma.ubicacion.findMany({
      where: { partida: u.partida, pallet: u.pallet, producto: u.producto },
      select: { position: true },
    });
    palletTotal = hermanos.length;
    const nums = hermanos
      .map((h) => parseInt(String(h.position ?? '').replace(/[^0-9]/g, ''), 10))
      .filter((n) => !isNaN(n));
    palletMaxPos = nums.length ? Math.max(...nums) : null;
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
    palletTotal,
    palletMaxPos,
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
