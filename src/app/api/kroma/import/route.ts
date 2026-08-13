import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Import del catálogo KROMA (Overpacking).
// Excel con 1 hoja, header en la fila 0. Columnas:
//   USDOMS CPU | SERVICE TAG CPU | USDOMS MONITOR | SERVICE TAG MONITOR | CAJA
// Cada fila = una CAJA MASTER (pareja CPU + monitor). El ST es la llave (7 chars Dell).

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const wipe = formData.get('wipe') === 'true';
    if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    // Elegimos la hoja que tenga las columnas de service tag.
    let target: string | null = null;
    let header: string[] = [];
    let headerIdx = -1;
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, defval: null });
      for (let i = 0; i < Math.min(6, rows.length); i++) {
        const r = (rows[i] ?? []).map((c) => String(c ?? '').toLowerCase().trim());
        const hasCpu = r.some((h) => h.includes('service tag') && h.includes('cpu'));
        const hasMon = r.some((h) => h.includes('service tag') && h.includes('monitor'));
        if (hasCpu && hasMon) { target = sn; header = r; headerIdx = i; break; }
      }
      if (target) break;
    }
    if (!target) {
      return NextResponse.json(
        { error: `No se encontró hoja con columnas SERVICE TAG CPU / MONITOR. Hojas: ${wb.SheetNames.join(', ')}` },
        { status: 400 },
      );
    }

    const find = (pred: (h: string) => boolean) => header.findIndex(pred);
    const iUsdomCpu = find((h) => h.includes('usdom') && h.includes('cpu'));
    const iStCpu    = find((h) => h.includes('service tag') && h.includes('cpu'));
    const iUsdomMon = find((h) => h.includes('usdom') && h.includes('monitor'));
    const iStMon    = find((h) => h.includes('service tag') && h.includes('monitor'));
    const iCaja     = find((h) => h.trim() === 'caja');

    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[target], { header: 1, defval: null });
    const records: any[] = [];
    const errors: string[] = [];
    const seenCpu = new Set<string>();
    const seenMon = new Set<string>();
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const usdomCpu = norm(r[iUsdomCpu]);
      const stCpu = norm(r[iStCpu]);
      const usdomMonitor = norm(r[iUsdomMon]);
      const stMonitor = norm(r[iStMon]);
      const cajaLabel = iCaja >= 0 ? String(r[iCaja] ?? '').trim() || null : null;
      if (!stCpu && !stMonitor) continue; // fila vacía
      if (!usdomCpu || !stCpu || !usdomMonitor || !stMonitor) {
        errors.push(`Fila ${i + 1}: datos incompletos (${usdomCpu}/${stCpu}/${usdomMonitor}/${stMonitor})`);
        continue;
      }
      if (seenCpu.has(stCpu)) { errors.push(`Fila ${i + 1}: ST CPU duplicado ${stCpu}`); continue; }
      if (seenMon.has(stMonitor)) { errors.push(`Fila ${i + 1}: ST Monitor duplicado ${stMonitor}`); continue; }
      seenCpu.add(stCpu); seenMon.add(stMonitor);
      records.push({ usdomCpu, stCpu, usdomMonitor, stMonitor, cajaLabel });
    }

    if (wipe) {
      await prisma.kromaBox.deleteMany();
    }

    // Upsert por stCpu (idempotente). Preserva estado si ya existía y no se pidió wipe.
    let inserted = 0, updated = 0;
    for (const rec of records) {
      const existing = await prisma.kromaBox.findUnique({ where: { stCpu: rec.stCpu }, select: { id: true } });
      if (existing) {
        await prisma.kromaBox.update({
          where: { stCpu: rec.stCpu },
          data: { usdomCpu: rec.usdomCpu, usdomMonitor: rec.usdomMonitor, stMonitor: rec.stMonitor, cajaLabel: rec.cajaLabel },
        });
        updated++;
      } else {
        await prisma.kromaBox.create({ data: rec });
        inserted++;
      }
    }

    // Resumen por orden CPU
    const porOrden = await prisma.kromaBox.groupBy({ by: ['usdomCpu'], _count: { _all: true } });
    const total = await prisma.kromaBox.count();

    return NextResponse.json({
      ok: true,
      sheet: target,
      leidas: records.length,
      inserted, updated,
      totalBD: total,
      porOrden: Object.fromEntries(porOrden.map((p) => [p.usdomCpu, p._count._all])),
      errores: errors.slice(0, 20),
      totalErrores: errors.length,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
