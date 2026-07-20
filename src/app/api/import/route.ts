import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';
import { detectType } from '@/lib/equipmentType';
import { allCellsVertical } from '@/lib/board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Parsea el Excel de Radiomovil (2 sheets con equipos):
//   - "Equipo computo central"  (AM2150…)
//   - "Equipo de respaldo"      (EQR…)
// Ambos con header en row 1 y datos desde row 2. Columnas:
//   A=PO  B=Orden Dell  C=Producto  D=Cantidad  E=Perfil  F=PEDIDO  G=POSICIÓN
//   H=SAP I=DESCRIPCIÓN J=SERIE (Asset Tag) K=REGIÓN L=INVENTARIO M=SOLICITANTE N=Tipo etiqueta

function parseSheet(ws: XLSX.WorkSheet, sheetName: string) {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  // Buscar la fila con "SERIE" e "INVENTARIO"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i];
    if (!r) continue;
    const hasSerie = r.some((c) => String(c ?? '').toLowerCase().trim() === 'serie');
    const hasInv = r.some((c) => String(c ?? '').toLowerCase().trim() === 'inventario');
    if (hasSerie && hasInv) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { records: [], error: `No se encontró header en sheet "${sheetName}"` };

  const header = rows[headerIdx].map((c) => String(c ?? '').toLowerCase().trim());
  const idx = (name: string) => header.findIndex((h) => h === name.toLowerCase());

  const iPO = idx('po');
  const iOrden = idx('orden dell') !== -1 ? idx('orden dell') : idx('order number');
  const iProd = idx('producto') !== -1 ? idx('producto') : idx('product description');
  const iQty = idx('cantidad por orden') !== -1 ? idx('cantidad por orden') : idx('tie quantity');
  const iPerfil = idx('perfil de imagen');
  const iPedido = idx('pedido');
  const iPos = idx('posición') !== -1 ? idx('posición') : idx('posicion');
  const iSAP = idx('sap');
  const iDesc = idx('descripción') !== -1 ? idx('descripción') : idx('descripcion');
  const iSerie = idx('serie');
  const iRegion = idx('región') !== -1 ? idx('región') : idx('region');
  const iInv = idx('inventario');
  const iSol = idx('solicitante');
  const iTipo = idx('tipo de etiqueta de activo');

  if (iSerie === -1 || iInv === -1) {
    return { records: [], error: `Faltan columnas Serie/Inventario en ${sheetName}` };
  }

  const out: any[] = [];
  const seen = new Set<string>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const assetTag = norm(r[iSerie]);
    const inventario = norm(r[iInv]);
    if (!assetTag || !inventario) continue;
    if (seen.has(assetTag)) continue;
    seen.add(assetTag);

    const producto = iProd >= 0 ? String(r[iProd] ?? '').trim() || null : null;
    const descripcion = iDesc >= 0 ? String(r[iDesc] ?? '').trim() || null : null;

    out.push({
      po: iPO >= 0 ? String(r[iPO] ?? '').trim() || null : null,
      ordenDell: iOrden >= 0 ? String(r[iOrden] ?? '').trim() || null : null,
      producto,
      cantidadOrden:
        iQty >= 0 && r[iQty] != null && !isNaN(Number(r[iQty])) ? Number(r[iQty]) : null,
      perfilImagen: iPerfil >= 0 ? String(r[iPerfil] ?? '').trim() || null : null,
      pedido: iPedido >= 0 ? String(r[iPedido] ?? '').trim() || null : null,
      posicion: iPos >= 0 ? String(r[iPos] ?? '').trim() || null : null,
      sap: iSAP >= 0 ? String(r[iSAP] ?? '').trim() || null : null,
      descripcion,
      assetTag,
      region: iRegion >= 0 ? String(r[iRegion] ?? '').trim() || null : null,
      inventario,
      solicitante: iSol >= 0 ? String(r[iSol] ?? '').trim() || null : null,
      tipoEtiqueta: iTipo >= 0 ? String(r[iTipo] ?? '').trim() || null : null,
      equipmentType: detectType(producto, descripcion),
    });
  }
  return { records: out, error: null as string | null };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const wipe = formData.get('wipe') === 'true';

    if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    // Sheets con equipos. Formatos soportados:
    //   - "Equipo computo central" y "Equipo de respaldo" (formato antiguo, 2 sheets)
    //   - "Equipo universal" (formato final, 1 sheet)
    //   - "Reporte" (formato inicial)
    // Cualquier sheet cuyo nombre incluya "equipo" o "reporte" es candidato.
    const targetSheets = wb.SheetNames.filter((n) => {
      const nl = n.toLowerCase();
      return nl.includes('equipo') || nl.includes('computo') || nl.includes('respaldo') || nl.includes('reporte') || nl.includes('universal');
    });
    if (!targetSheets.length) {
      return NextResponse.json(
        { error: `No se encontró sheet de equipos. Sheets disponibles: ${wb.SheetNames.join(', ')}` },
        { status: 400 },
      );
    }

    const summaries: any[] = [];
    let allRecords: any[] = [];
    for (const sn of targetSheets) {
      const { records, error } = parseSheet(wb.Sheets[sn], sn);
      if (error) return NextResponse.json({ error }, { status: 400 });
      summaries.push({ sheet: sn, count: records.length });
      allRecords = allRecords.concat(records);
    }

    // Dedup global por assetTag (por si un asset aparece en ambos sheets)
    const dedup = new Map<string, any>();
    for (const r of allRecords) if (!dedup.has(r.assetTag)) dedup.set(r.assetTag, r);
    const records = [...dedup.values()];

    if (wipe) {
      await prisma.scanEvent.deleteMany();
      await prisma.boardSlot.deleteMany();
      await prisma.equipment.deleteMany();
    }

    let inserted = 0;
    const BATCH = 200;
    for (let i = 0; i < records.length; i += BATCH) {
      const chunk = records.slice(i, i + BATCH);
      const res = await prisma.equipment.createMany({ data: chunk });
      inserted += res.count;
    }

    // Asegura BoardSlots
    for (const c of allCellsVertical()) {
      await prisma.boardSlot.upsert({ where: { cell: c }, create: { cell: c }, update: {} });
    }

    // Contadores por tipo
    const byType = await prisma.equipment.groupBy({
      by: ['equipmentType'],
      _count: { _all: true },
    });

    return NextResponse.json({
      ok: true,
      summaries,
      totalRecords: records.length,
      inserted,
      byType: Object.fromEntries(byType.map((b) => [b.equipmentType, b._count._all])),
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
