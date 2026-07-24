import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENTE = 'RADIOMOVIL DIPSA S.A. DE C.V. (TELCEL)';

// Packing list imprimible: UNA HOJA POR PALLET.
// Cada hoja lleva encabezado con cliente + datos del pallet, y la tabla de contenido.
//   ?only=scanned  → solo equipos ya escaneados en /cama
//   ?partida=X     → filtra a una partida
//   ?pallet=N      → un solo pallet
//   ?format=json   → devuelve el desglose en JSON (diagnóstico, no genera Excel)
export async function GET(req: NextRequest) {
  const only = req.nextUrl.searchParams.get('only');
  const partida = req.nextUrl.searchParams.get('partida')?.trim();
  const pallet = req.nextUrl.searchParams.get('pallet')?.trim();
  const format = req.nextUrl.searchParams.get('format');

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

  if (format === 'json') {
    return NextResponse.json({
      totalEquipos: items.length,
      totalPallets: ordered.length,
      pallets: ordered.map(([k, list]) => {
        const [pt, pl] = k.split('||');
        return { partida: pt, pallet: pl, equipos: list.length, camas: uniq(list.map((x) => x.cama)) };
      }),
    });
  }

  const wb = XLSX.utils.book_new();
  const hoy = new Date().toISOString().slice(0, 10);
  const usedNames = new Set<string>();

  for (const [key, list] of ordered) {
    const [pt, pl] = key.split('||');

    list.sort((a, b) =>
      numOr(a.cama) - numOr(b.cama) ||
      String(a.cama ?? '').localeCompare(String(b.cama ?? '')) ||
      numOr(a.position) - numOr(b.position)
    );

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
        i + 1,
        u.cama ?? '',
        u.position ?? '',
        u.assetTag,
        u.inventario,
        u.producto ?? '',
        u.ordenDell ?? '',
        u.scannedAt ? 'SI' : 'NO',
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
    // Merges del encabezado
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // título
      { s: { r: 2, c: 1 }, e: { r: 2, c: 7 } }, // cliente
      { s: { r: 5, c: 1 }, e: { r: 5, c: 7 } }, // órdenes
    ];
    // Repetir la fila de headers en cada página impresa
    ws['!printHeader'] = [9, 9];

    // Nombre de hoja: max 31 chars, sin caracteres prohibidos por Excel
    let name = `${pt}-P${pl}`.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    let n = 2;
    while (usedNames.has(name)) {
      const suffix = `~${n++}`;
      name = name.slice(0, 31 - suffix.length) + suffix;
    }
    usedNames.add(name);

    XLSX.utils.book_append_sheet(wb, ws, name);
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
      'Content-Disposition': `attachment; filename="packing-list${tag ? '_' + tag : ''}-${stamp}.xlsx"`,
    },
  });
}
