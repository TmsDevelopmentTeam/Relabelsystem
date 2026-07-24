import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENTE = 'RADIOMOVIL DIPSA S.A. DE C.V. (TELCEL)';

// Export completo en UN SOLO archivo:
//   Hoja "Resumen"  → 1 renglón por pallet (control)
//   Hoja "Detalle"  → 1 renglón por equipo (control, con autofilter)
//   Hoja por pallet → packing list imprimible de cada tarima
//
//   ?only=scanned  → solo equipos ya escaneados en /cama
//   ?partida=X     → filtra a una partida
//   ?pallet=N      → un solo pallet
export async function GET(req: NextRequest) {
  const only = req.nextUrl.searchParams.get('only');
  const partida = req.nextUrl.searchParams.get('partida')?.trim();
  const pallet = req.nextUrl.searchParams.get('pallet')?.trim();

  const where: any = {};
  if (only === 'scanned') where.scannedAt = { not: null };
  if (partida) where.partida = partida;
  if (pallet) where.pallet = pallet;

  const items = await prisma.ubicacion.findMany({ where });

  const numOr = (v: string | null | undefined) => {
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  const uniq = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter((x): x is string => !!x))).sort();

  items.sort((a, b) =>
    String(a.partida ?? '').localeCompare(String(b.partida ?? '')) ||
    numOr(a.pallet) - numOr(b.pallet) ||
    String(a.pallet ?? '').localeCompare(String(b.pallet ?? '')) ||
    numOr(a.cama) - numOr(b.cama) ||
    String(a.cama ?? '').localeCompare(String(b.cama ?? '')) ||
    numOr(a.position) - numOr(b.position)
  );

  // Un pallet es único por (partida, pallet): el numerado reinicia en cada partida.
  const groups = new Map<string, typeof items>();
  for (const u of items) {
    const k = `${u.partida ?? '(sin partida)'}||${u.pallet ?? '(sin pallet)'}`;
    if (!groups.has(k)) groups.set(k, [] as any);
    groups.get(k)!.push(u);
  }
  const ordered = Array.from(groups.entries()).sort((a, b) => {
    const [pa, la] = a[0].split('||');
    const [pb, lb] = b[0].split('||');
    return pa.localeCompare(pb) || numOr(la) - numOr(lb) || la.localeCompare(lb);
  });

  // Nombres de hoja estables (max 31 chars, sin caracteres prohibidos, sin colisiones)
  const usedNames = new Set<string>(['Resumen', 'Detalle']);
  const sheetNameFor = (pt: string, pl: string) => {
    let name = `${pt}-P${pl}`.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    let n = 2;
    while (usedNames.has(name)) {
      const suffix = `~${n++}`;
      name = name.slice(0, 31 - suffix.length) + suffix;
    }
    usedNames.add(name);
    return name;
  };
  const names = new Map<string, string>();
  for (const [key] of ordered) {
    const [pt, pl] = key.split('||');
    names.set(key, sheetNameFor(pt, pl));
  }

  const wb = XLSX.utils.book_new();
  const hoy = new Date().toISOString().slice(0, 10);

  // ---------- Hoja 1: Resumen ----------
  const resumen = ordered.map(([key, list]) => {
    const [pt, pl] = key.split('||');
    const camas = uniq(list.map((x) => x.cama));
    const escaneados = list.filter((x) => x.scannedAt).length;
    return {
      Hoja: names.get(key)!,
      Partida: pt,
      Pallet: pl,
      'Total Equipos': list.length,
      '# Camas': camas.length,
      Camas: camas.join(', '),
      'Órdenes Dell': uniq(list.map((x) => x.ordenDell)).join(', '),
      Productos: uniq(list.map((x) => x.producto)).join(', '),
      Escaneados: escaneados,
      Pendientes: list.length - escaneados,
      '% Completado': list.length ? Math.round((escaneados / list.length) * 100) : 0,
    };
  });
  const escTot = items.filter((x) => x.scannedAt).length;
  resumen.push({
    Hoja: '',
    Partida: 'TOTAL',
    Pallet: `${ordered.length} pallets`,
    'Total Equipos': items.length,
    '# Camas': uniq(items.map((x) => `${x.partida}|${x.pallet}|${x.cama}`)).length,
    Camas: '',
    'Órdenes Dell': `${uniq(items.map((x) => x.ordenDell)).length} órdenes`,
    Productos: '',
    Escaneados: escTot,
    Pendientes: items.length - escTot,
    '% Completado': items.length ? Math.round((escTot / items.length) * 100) : 0,
  });

  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  wsResumen['!cols'] = [
    { wch: 16 }, { wch: 14 }, { wch: 9 }, { wch: 14 }, { wch: 9 }, { wch: 22 },
    { wch: 40 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // ---------- Hoja 2: Detalle ----------
  const detalle = items.map((u) => ({
    Partida: u.partida ?? '',
    Pallet: u.pallet ?? '',
    Cama: u.cama ?? '',
    Position: u.position ?? '',
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
  const wsDetalle = XLSX.utils.json_to_sheet(detalle);
  wsDetalle['!cols'] = [
    { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 40 }, { wch: 11 }, { wch: 20 }, { wch: 16 },
  ];
  if (wsDetalle['!ref']) wsDetalle['!autofilter'] = { ref: wsDetalle['!ref'] };
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');

  // ---------- Una hoja de packing list por pallet ----------
  for (const [key, list] of ordered) {
    const [pt, pl] = key.split('||');
    const ordenes = uniq(list.map((x) => x.ordenDell));
    const camas = uniq(list.map((x) => x.cama));
    const escaneados = list.filter((x) => x.scannedAt).length;

    const aoa: (string | number)[][] = [
      ['PACKING LIST'],
      [],
      ['Cliente:', CLIENTE],
      ['Partida:', pt, '', 'Pallet:', pl],
      ['Total de piezas:', list.length, '', 'Camas:', camas.join(', ')],
      ['Órdenes Dell:', ordenes.join(', ')],
      ['Fecha:', hoy, '', 'Escaneados:', `${escaneados} / ${list.length}`],
      [],
      ['#', 'Cama', 'Position', 'Serie (SN)', 'Inventario', 'Producto', 'Orden Dell', 'Escaneado'],
    ];
    list.forEach((u, i) => {
      aoa.push([
        i + 1, u.cama ?? '', u.position ?? '', u.assetTag, u.inventario,
        u.producto ?? '', u.ordenDell ?? '', u.scannedAt ? 'SI' : 'NO',
      ]);
    });
    aoa.push([]);
    aoa.push(['', '', '', 'TOTAL PIEZAS:', list.length]);
    aoa.push([]);
    aoa.push(['Armó:', '________________________', '', 'Recibió:', '________________________']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 5 }, { wch: 8 }, { wch: 10 }, { wch: 14 },
      { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 11 },
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 2, c: 1 }, e: { r: 2, c: 7 } },
      { s: { r: 5, c: 1 }, e: { r: 5, c: 7 } },
    ];
    ws['!printHeader'] = [9, 9];
    XLSX.utils.book_append_sheet(wb, ws, names.get(key)!);
  }

  if (!wb.SheetNames.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Sin resultados para los filtros aplicados']]), 'Vacio');
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const tag = [only === 'scanned' ? 'escaneados' : null, partida ? `p-${partida}` : null, pallet ? `pallet-${pallet}` : null]
    .filter(Boolean).join('_');

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pallets-packing-list${tag ? '_' + tag : ''}-${stamp}.xlsx"`,
    },
  });
}
