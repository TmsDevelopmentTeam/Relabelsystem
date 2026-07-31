import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { mxDateTime } from '@/lib/time';

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

  // Agrupa una lista por producto (separado, NO combinado) en orden alfabético.
  const porProducto = (list: typeof items) => {
    const m = new Map<string, typeof items>();
    for (const u of list) {
      const p = u.producto ?? '(sin producto)';
      if (!m.has(p)) m.set(p, [] as any);
      m.get(p)!.push(u);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // ---------- Hoja 1: Resumen (SEPARADO por producto: 1 fila por pallet + producto) ----------
  const resumen: any[] = [];
  for (const [key, list] of ordered) {
    const [pt, pl] = key.split('||');
    for (const [prod, sub] of porProducto(list)) {
      const camas = uniq(sub.map((x) => x.cama));
      const escaneados = sub.filter((x) => x.scannedAt).length;
      resumen.push({
        Hoja: names.get(key)!,
        Partida: pt,
        Pallet: pl,
        Producto: prod,
        Cantidad: sub.length,
        '# Camas': camas.length,
        Camas: camas.join(', '),
        'Órdenes Dell': uniq(sub.map((x) => x.ordenDell)).join(', '),
        Escaneados: escaneados,
        Pendientes: sub.length - escaneados,
        '% Completado': sub.length ? Math.round((escaneados / sub.length) * 100) : 0,
      });
    }
  }
  // Totales por producto (global) al final
  resumen.push({});
  for (const [prod, sub] of porProducto(items)) {
    const escaneados = sub.filter((x) => x.scannedAt).length;
    resumen.push({
      Hoja: 'TOTAL',
      Partida: '',
      Pallet: '',
      Producto: prod,
      Cantidad: sub.length,
      '# Camas': '',
      Camas: '',
      'Órdenes Dell': `${uniq(sub.map((x) => x.ordenDell)).length} órdenes`,
      Escaneados: escaneados,
      Pendientes: sub.length - escaneados,
      '% Completado': sub.length ? Math.round((escaneados / sub.length) * 100) : 0,
    });
  }
  const escTot = items.filter((x) => x.scannedAt).length;
  resumen.push({
    Hoja: 'TOTAL', Partida: '', Pallet: '', Producto: '➤ TODOS',
    Cantidad: items.length, '# Camas': '', Camas: '',
    'Órdenes Dell': `${uniq(items.map((x) => x.ordenDell)).length} órdenes`,
    Escaneados: escTot, Pendientes: items.length - escTot,
    '% Completado': items.length ? Math.round((escTot / items.length) * 100) : 0,
  });

  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  wsResumen['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 32 }, { wch: 10 }, { wch: 8 }, { wch: 20 },
    { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
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
    'Escaneado At': mxDateTime(u.scannedAt),
    'Escaneado Por': u.scannedBy ?? '',
  }));
  const wsDetalle = XLSX.utils.json_to_sheet(detalle);
  wsDetalle['!cols'] = [
    { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 40 }, { wch: 11 }, { wch: 20 }, { wch: 16 },
  ];
  if (wsDetalle['!ref']) wsDetalle['!autofilter'] = { ref: wsDetalle['!ref'] };
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');

  // ---------- Hojas consolidadas: TODO un producto en una sola lista ----------
  // (ej. TODOS los Dell Pro Slim juntos, no repartidos por pestaña de pallet)
  const usedProdNames = new Set<string>(wb.SheetNames);
  const prodSheetName = (prod: string) => {
    let name = prod.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    let n = 2;
    while (usedProdNames.has(name)) {
      const sfx = `~${n++}`;
      name = name.slice(0, 31 - sfx.length) + sfx;
    }
    usedProdNames.add(name);
    return name;
  };
  for (const [prod, sub] of porProducto(items)) {
    sub.sort((a, b) =>
      String(a.partida ?? '').localeCompare(String(b.partida ?? '')) ||
      numOr(a.pallet) - numOr(b.pallet) || String(a.pallet ?? '').localeCompare(String(b.pallet ?? '')) ||
      numOr(a.cama) - numOr(b.cama) || String(a.cama ?? '').localeCompare(String(b.cama ?? '')) ||
      numOr(a.position) - numOr(b.position)
    );
    const escaneados = sub.filter((x) => x.scannedAt).length;
    const aoa: (string | number)[][] = [
      [prod.toUpperCase()],
      [`Total: ${sub.length}`, '', `Escaneados: ${escaneados} / ${sub.length}`, '', `Cliente: ${CLIENTE}`, '', `Fecha: ${hoy}`],
      [],
      ['#', 'Partida', 'Pallet', 'Cama', 'Position', 'Serie (SN)', 'Inventario', 'Orden Dell', 'Escaneado'],
    ];
    sub.forEach((u, i) => {
      aoa.push([
        i + 1, u.partida ?? '', u.pallet ?? '', u.cama ?? '', u.position ?? '',
        u.assetTag, u.inventario, u.ordenDell ?? '', u.scannedAt ? 'SI' : 'NO',
      ]);
    });
    aoa.push([]);
    aoa.push(['', '', '', '', '', '', '', 'TOTAL:', sub.length]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
      { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 11 },
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    ];
    if (ws['!ref']) ws['!autofilter'] = { ref: `A4:I${4 + sub.length}` };
    XLSX.utils.book_append_sheet(wb, ws, prodSheetName(prod));
  }

  // ---------- Una hoja de packing list por pallet ----------
  for (const [key, list] of ordered) {
    const [pt, pl] = key.split('||');
    const ordenes = uniq(list.map((x) => x.ordenDell));
    const camas = uniq(list.map((x) => x.cama));
    const escaneados = list.filter((x) => x.scannedAt).length;

    const grupos = porProducto(list);
    // Desglose por producto para el encabezado: "Monitor...: 72 · Dell Pro Slim: 30"
    const desglose = grupos.map(([prod, sub]) => `${prod}: ${sub.length}`).join('  ·  ');

    const aoa: (string | number)[][] = [
      ['PACKING LIST'],
      [],
      ['Cliente:', CLIENTE],
      ['Partida:', pt, '', 'Pallet:', pl],
      ['Total de piezas:', list.length, '', 'Camas:', camas.join(', ')],
      ['Órdenes Dell:', ordenes.join(', ')],
      ['Desglose:', desglose],
      ['Fecha:', hoy, '', 'Escaneados:', `${escaneados} / ${list.length}`],
      [],
    ];

    // Contenido SEPARADO por producto: cada producto su sección, subtotal y numeración propia.
    for (const [prod, sub] of grupos) {
      const escSub = sub.filter((x) => x.scannedAt).length;
      sub.sort((a, b) =>
        numOr(a.cama) - numOr(b.cama) ||
        String(a.cama ?? '').localeCompare(String(b.cama ?? '')) ||
        numOr(a.position) - numOr(b.position)
      );
      aoa.push([`▸ ${prod}  (${sub.length} piezas · ${escSub}/${sub.length} escaneadas)`]);
      aoa.push(['#', 'Cama', 'Position', 'Serie (SN)', 'Inventario', 'Orden Dell', 'Escaneado']);
      sub.forEach((u, i) => {
        aoa.push([
          i + 1, u.cama ?? '', u.position ?? '', u.assetTag, u.inventario,
          u.ordenDell ?? '', u.scannedAt ? 'SI' : 'NO',
        ]);
      });
      aoa.push(['', '', '', '', '', `SUBTOTAL ${prod}:`, sub.length]);
      aoa.push([]);
    }

    aoa.push(['', '', '', 'TOTAL PALLET:', list.length]);
    aoa.push([]);
    aoa.push(['Armó:', '________________________', '', 'Recibió:', '________________________']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 6 }, { wch: 8 }, { wch: 10 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 12 },
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // título
      { s: { r: 2, c: 1 }, e: { r: 2, c: 6 } }, // cliente
      { s: { r: 5, c: 1 }, e: { r: 5, c: 6 } }, // órdenes
      { s: { r: 6, c: 1 }, e: { r: 6, c: 6 } }, // desglose
    ];
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
