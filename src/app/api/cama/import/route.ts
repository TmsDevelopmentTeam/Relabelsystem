import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Importa cualquier sheet que tenga columnas SERIE + INVENTARIO + Cama + Position + Pallet.
// Por defecto usa el primer sheet que las tenga. Sube el Excel completo — el módulo
// solo lee lo que necesita para Ubicacion, sin tocar Equipment ni el resto.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const wipe = formData.get('wipe') === 'true';
    if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    // Buscar el sheet que tenga las columnas Cama + Position + Pallet
    let targetSheet: string | null = null;
    let headerIdx = -1;
    let header: string[] = [];
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, defval: null });
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const r = rows[i]; if (!r) continue;
        const low = r.map((c) => String(c ?? '').toLowerCase().trim());
        if (low.includes('cama') && low.includes('position') && low.includes('pallet') && low.includes('serie')) {
          targetSheet = sn;
          headerIdx = i;
          header = low;
          break;
        }
      }
      if (targetSheet) break;
    }
    if (!targetSheet) {
      return NextResponse.json({ error: `No se encontró sheet con columnas Cama/Position/Pallet/Serie. Sheets: ${wb.SheetNames.join(', ')}` }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[targetSheet], { header: 1, defval: null });
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

    if (wipe) await prisma.ubicacion.deleteMany();

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
        partida: iPartida >= 0 ? String(r[iPartida] ?? '').trim() || null : null,
        descripcion: iDesc >= 0 ? String(r[iDesc] ?? '').trim() || null : null,
        assetTag,
        inventario,
        cama: iCama >= 0 ? String(r[iCama] ?? '').trim() || null : null,
        position: iPos >= 0 ? String(r[iPos] ?? '').trim() || null : null,
        pallet: iPallet >= 0 ? String(r[iPallet] ?? '').trim() || null : null,
      });
    }

    let inserted = 0;
    const BATCH = 200;
    for (let i = 0; i < records.length; i += BATCH) {
      const chunk = records.slice(i, i + BATCH);
      const res = await prisma.ubicacion.createMany({ data: chunk });
      inserted += res.count;
    }

    const total = await prisma.ubicacion.count();
    return NextResponse.json({
      ok: true,
      sheet: targetSheet,
      recordsValid: records.length,
      inserted,
      totalInDB: total,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
