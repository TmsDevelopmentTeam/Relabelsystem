import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Importa TODOS los sheets del Excel que tengan columnas Cama/Position/Pallet/Serie/Inventario.
// Comportamiento:
//   - Iterativo: procesa cada sheet compatible por separado
//   - Upsert por assetTag: si ya existe, ACTUALIZA (no falla)
//   - Sin wipe: acumula/actualiza — puedes subir múltiples Excel sin miedo
//   - Con wipe=true: borra TODO antes de importar
type SheetSummary = { sheet: string; recordsValid: number; inserted: number; updated: number };

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const wipe = formData.get('wipe') === 'true';
    if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    if (wipe) await prisma.ubicacion.deleteMany();

    const summaries: SheetSummary[] = [];
    const skippedSheets: string[] = [];

    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });

      // Buscar header con Cama+Position+Pallet+Serie+Inventario
      let headerIdx = -1;
      let header: string[] = [];
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const r = rows[i]; if (!r) continue;
        const low = r.map((c) => String(c ?? '').toLowerCase().trim());
        if (low.includes('cama') && low.includes('position') && low.includes('pallet')
            && low.includes('serie') && low.includes('inventario')) {
          headerIdx = i;
          header = low;
          break;
        }
      }
      if (headerIdx === -1) { skippedSheets.push(sn); continue; }

      const idx = (n: string) => header.findIndex((h) => h === n.toLowerCase());
      const iPO = idx('po');
      const iOrden = idx('orden dell') !== -1 ? idx('orden dell') : idx('order number');
      const iProd = idx('producto') !== -1 ? idx('producto') : idx('product description');
      const iQty = idx('cantidad por orden') !== -1 ? idx('cantidad por orden') : idx('tie quantity');
      const iPartida = idx('partida');
      const iDesc = idx('descripción') !== -1 ? idx('descripción') : idx('descripcion');
      const iSerie = idx('serie');
      const iInv = idx('inventario');
      const iCama = idx('cama');
      const iPos = idx('position');
      const iPallet = idx('pallet');

      const seen = new Set<string>();
      const records: any[] = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r) continue;
        const assetTag = norm(r[iSerie]);
        const inventario = norm(r[iInv]);
        if (!assetTag || !inventario) continue;
        if (seen.has(assetTag)) continue;
        seen.add(assetTag);
        records.push({
          po: iPO >= 0 ? String(r[iPO] ?? '').trim() || null : null,
          ordenDell: iOrden >= 0 ? String(r[iOrden] ?? '').trim() || null : null,
          producto: iProd >= 0 ? String(r[iProd] ?? '').trim() || null : null,
          cantidad: iQty >= 0 && r[iQty] != null && !isNaN(Number(r[iQty])) ? Number(r[iQty]) : null,
          partida: iPartida >= 0 ? String(r[iPartida] ?? '').trim() || null : sn.trim(),
          descripcion: iDesc >= 0 ? String(r[iDesc] ?? '').trim() || null : null,
          assetTag,
          inventario,
          cama: iCama >= 0 ? String(r[iCama] ?? '').trim() || null : null,
          position: iPos >= 0 ? String(r[iPos] ?? '').trim() || null : null,
          pallet: iPallet >= 0 ? String(r[iPallet] ?? '').trim() || null : null,
        });
      }

      // Estrategia optimizada: primero traer los assetTags que ya existen (1 query),
      // luego batch update para existentes y batch createMany para nuevos.
      const assetTags = records.map((r) => r.assetTag);
      const existing = await prisma.ubicacion.findMany({
        where: { assetTag: { in: assetTags } },
        select: { assetTag: true },
      });
      const existingSet = new Set(existing.map((e) => e.assetTag));

      const toCreate = records.filter((r) => !existingSet.has(r.assetTag));
      const toUpdate = records.filter((r) => existingSet.has(r.assetTag));

      // Batch insert
      let inserted = 0;
      const BATCH = 500;
      for (let i = 0; i < toCreate.length; i += BATCH) {
        const chunk = toCreate.slice(i, i + BATCH);
        const res = await prisma.ubicacion.createMany({ data: chunk });
        inserted += res.count;
      }
      // Updates individuales (Prisma no soporta batch update con datos distintos)
      let updated = 0;
      for (const rec of toUpdate) {
        await prisma.ubicacion.update({ where: { assetTag: rec.assetTag }, data: rec });
        updated++;
      }

      summaries.push({ sheet: sn, recordsValid: records.length, inserted, updated });
    }

    const total = await prisma.ubicacion.count();
    return NextResponse.json({
      ok: true,
      summaries,
      skippedSheets,
      totalInDB: total,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
