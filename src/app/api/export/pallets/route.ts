import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Packing list de pallets.
//   ?only=scanned  → solo equipos ya escaneados en /cama
//   ?partida=X     → filtra a una partida
//   ?pallet=N      → filtra a un pallet
// Genera un xlsx con 2 hojas: Resumen (1 renglón por pallet) y Detalle (1 renglón por equipo).
export async function GET(req: NextRequest) {
  const only = req.nextUrl.searchParams.get('only');
  const partida = req.nextUrl.searchParams.get('partida')?.trim();
  const pallet = req.nextUrl.searchParams.get('pallet')?.trim();

  const where: any = {};
  if (only === 'scanned') where.scannedAt = { not: null };
  if (partida) where.partida = partida;
  if (pallet) where.pallet = pallet;

  const items = await prisma.ubicacion.findMany({ where });

  // Orden natural: pallet → cama → position, numérico cuando aplica
  const numOr = (v: string | null | undefined) => {
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  items.sort((a, b) =>
    numOr(a.pallet) - numOr(b.pallet) ||
    String(a.pallet ?? '').localeCompare(String(b.pallet ?? '')) ||
    numOr(a.cama) - numOr(b.cama) ||
    String(a.cama ?? '').localeCompare(String(b.cama ?? '')) ||
    numOr(a.position) - numOr(b.position)
  );

  // ---- Hoja Detalle ----
  const detalle = items.map((u) => ({
    Pallet: u.pallet ?? '',
    Cama: u.cama ?? '',
    Position: u.position ?? '',
    Partida: u.partida ?? '',
    'Orden Dell': u.ordenDell ?? '',
    PO: u.po ?? '',
    'Serie (SN)': u.assetTag,
    Inventario: u.inventario,
    Producto: u.producto ?? '',
    Descripción: u.descripcion ?? '',
    Escaneado: u.scannedAt ? 'SI' : 'NO',
    'Escaneado At': u.scannedAt ? u.scannedAt.toISOString().slice(0, 19).replace('T', ' ') : '',
    'Escaneado Por': u.scannedBy ?? '',
  }));

  // ---- Hoja Resumen (agrupado por pallet) ----
  const byPallet = new Map<string, typeof items>();
  for (const u of items) {
    const k = u.pallet ?? '(sin pallet)';
    if (!byPallet.has(k)) byPallet.set(k, [] as any);
    byPallet.get(k)!.push(u);
  }
  const uniq = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter((x): x is string => !!x))).sort();

  const resumen = Array.from(byPallet.entries()).map(([p, list]) => {
    const camas = uniq(list.map((x) => x.cama));
    const escaneados = list.filter((x) => x.scannedAt).length;
    return {
      Pallet: p,
      'Total Equipos': list.length,
      '# Camas': camas.length,
      Camas: camas.join(', '),
      Partidas: uniq(list.map((x) => x.partida)).join(', '),
      'Órdenes Dell': uniq(list.map((x) => x.ordenDell)).join(', '),
      Productos: uniq(list.map((x) => x.producto)).join(', '),
      Escaneados: escaneados,
      Pendientes: list.length - escaneados,
      '% Completado': list.length ? Math.round((escaneados / list.length) * 100) : 0,
    };
  });

  // Total al final del resumen
  resumen.push({
    Pallet: 'TOTAL',
    'Total Equipos': items.length,
    '# Camas': uniq(items.map((x) => `${x.pallet}|${x.cama}`)).length,
    Camas: '',
    Partidas: uniq(items.map((x) => x.partida)).join(', '),
    'Órdenes Dell': `${uniq(items.map((x) => x.ordenDell)).length} órdenes`,
    Productos: '',
    Escaneados: items.filter((x) => x.scannedAt).length,
    Pendientes: items.filter((x) => !x.scannedAt).length,
    '% Completado': items.length
      ? Math.round((items.filter((x) => x.scannedAt).length / items.length) * 100)
      : 0,
  });

  const wb = XLSX.utils.book_new();

  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  wsResumen['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 9 }, { wch: 22 }, { wch: 20 },
    { wch: 40 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  const wsDetalle = XLSX.utils.json_to_sheet(detalle);
  wsDetalle['!cols'] = [
    { wch: 9 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 40 }, { wch: 11 }, { wch: 20 }, { wch: 16 },
  ];
  wsDetalle['!autofilter'] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(wsDetalle['!ref'] ?? 'A1')) };
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const tag = [only === 'scanned' ? 'escaneados' : null, partida ? `p-${partida}` : null, pallet ? `pallet-${pallet}` : null]
    .filter(Boolean).join('_');
  const fname = `packing-list-pallets${tag ? '_' + tag : ''}-${stamp}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}
