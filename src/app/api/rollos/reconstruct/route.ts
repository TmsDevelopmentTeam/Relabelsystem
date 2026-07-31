import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// RECUPERACIÓN: reconstruye LabelRoll para todo equipo que YA pasó por el flujo
// (status != PENDING => su etiqueta de rollo fue escaneada con certeza).
//   - MONITOR / LAPTOP: rollo por ORDEN (orderNumber = ordenDell/po). Laptop = 2 etiquetas.
//   - DESKTOP: rollo por PALLET (orderNumber = "PARTIDA · P#", desde Ubicacion).
// Solo INSERTA (no borra). Idempotente: no duplica lo ya presente.
export async function POST() {
  const eqs = await prisma.equipment.findMany({
    where: { status: { not: 'PENDING' } },
    select: { assetTag: true, inventario: true, equipmentType: true, ordenDell: true, po: true, status: true },
  });
  const ubis = await prisma.ubicacion.findMany({ select: { assetTag: true, inventario: true, partida: true, pallet: true } });
  const ubiByAsset = new Map(ubis.map((u) => [u.assetTag, u]));
  const ubiByInv = new Map<string, any>();
  for (const u of ubis) if (!ubiByInv.has(u.inventario)) ubiByInv.set(u.inventario, u);

  // Construir entradas agrupadas por key
  const porKey = new Map<string, string[]>(); // key -> array de inventarios (repetido si 2 etiquetas)
  for (const e of eqs) {
    let key: string | null = null;
    if (e.equipmentType === 'DESKTOP') {
      const u = ubiByAsset.get(e.assetTag) ?? ubiByInv.get(e.inventario);
      if (u?.partida && u.pallet != null) key = `${u.partida} · P${u.pallet}`;
    } else {
      key = e.ordenDell ?? e.po ?? null;
    }
    if (!key) continue;
    const reps = e.equipmentType === 'LAPTOP' ? 2 : 1;
    const arr = porKey.get(key) ?? [];
    for (let i = 0; i < reps; i++) arr.push(e.inventario);
    porKey.set(key, arr);
  }

  // Insertar respetando lo ya existente (idempotente)
  let inserted = 0;
  const keysDone: { key: string; count: number }[] = [];
  for (const [key, invs] of porKey) {
    const existing = await prisma.labelRoll.findMany({ where: { orderNumber: key }, select: { position: true } });
    let pos = existing.reduce((m, r) => Math.max(m, r.position ?? 0), 0);
    // cuántas ya hay por valor, para no duplicar
    const yaPorValor = new Map<string, number>();
    const cur = await prisma.labelRoll.findMany({ where: { orderNumber: key }, select: { value: true } });
    for (const r of cur) yaPorValor.set(r.value, (yaPorValor.get(r.value) ?? 0) + 1);
    const necesarioPorValor = new Map<string, number>();
    for (const inv of invs) necesarioPorValor.set(inv, (necesarioPorValor.get(inv) ?? 0) + 1);

    const toCreate: any[] = [];
    for (const [inv, need] of necesarioPorValor) {
      const have = yaPorValor.get(inv) ?? 0;
      for (let i = have; i < need; i++) { pos += 1; toCreate.push({ value: inv, orderNumber: key, position: pos, operator: 'reconstruido' }); }
    }
    if (toCreate.length) {
      for (let i = 0; i < toCreate.length; i += 500) {
        const res = await prisma.labelRoll.createMany({ data: toCreate.slice(i, i + 500) });
        inserted += res.count;
      }
    }
    keysDone.push({ key, count: invs.length });
  }

  const total = await prisma.labelRoll.count();
  return NextResponse.json({ ok: true, inserted, keys: keysDone.length, totalRollsNow: total, keysDone: keysDone.sort((a, b) => a.key.localeCompare(b.key)) });
}
