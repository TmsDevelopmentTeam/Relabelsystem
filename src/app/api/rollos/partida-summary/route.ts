import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esLaptop = (p: string | null) => /pro 14|pc14250|laptop/i.test(String(p ?? ''));
const numOr = (v: string) => { const n = parseInt(v.replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 1e9 : n; };

// Resumen de rollos POR PARTIDA y POR PALLET: esperado (desde Cama) vs escaneado
// (LabelRoll con clave "PARTIDA · P#"). Para ver el avance del reetiquetado.
export async function GET() {
  const [ubis, rolls] = await Promise.all([
    prisma.ubicacion.findMany({ select: { partida: true, pallet: true, producto: true } }),
    prisma.labelRoll.findMany({ select: { orderNumber: true, value: true } }),
  ]);

  // esperado por partida/pallet
  const exp = new Map<string, { esperadas: number; equipos: number }>();
  for (const u of ubis) {
    if (!u.partida || u.pallet == null) continue;
    const k = `${u.partida}||${u.pallet}`;
    const cur = exp.get(k) ?? { esperadas: 0, equipos: 0 };
    cur.equipos += 1;
    cur.esperadas += esLaptop(u.producto) ? 2 : 1;
    exp.set(k, cur);
  }

  // escaneado por clave "PARTIDA · P#"
  const scan = new Map<string, { etiquetas: number; equipos: Set<string> }>();
  for (const r of rolls) {
    const m = String(r.orderNumber ?? '').match(/^(.+) · P(.+)$/);
    if (!m) continue;
    const k = `${m[1]}||${m[2]}`;
    const cur = scan.get(k) ?? { etiquetas: 0, equipos: new Set<string>() };
    cur.etiquetas += 1; cur.equipos.add(r.value);
    scan.set(k, cur);
  }

  // armar por partida
  const partidas = new Map<string, any>();
  for (const [k, e] of exp) {
    const [partida, pallet] = k.split('||');
    const s = scan.get(k);
    const escEquipos = s ? s.equipos.size : 0;
    if (!partidas.has(partida)) partidas.set(partida, { partida, totalEquipos: 0, escaneados: 0, pallets: [] });
    const P = partidas.get(partida);
    P.totalEquipos += e.equipos;
    P.escaneados += escEquipos;
    P.pallets.push({ pallet, equipos: e.equipos, escaneados: escEquipos, completo: escEquipos >= e.equipos });
  }
  const out = Array.from(partidas.values())
    .map((p) => ({ ...p, pallets: p.pallets.sort((a: any, b: any) => numOr(a.pallet) - numOr(b.pallet)) }))
    .sort((a, b) => a.partida.localeCompare(b.partida));

  return NextResponse.json({ partidas: out });
}
