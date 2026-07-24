import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Aplica positions desde un body JSON: { items: [{assetTag, pallet, cama, position}] }
// dry=1 en query: solo simula
export async function POST(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const body = await req.json();
  const items: any[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: 'body.items requerido' }, { status: 400 });

  const changes: any[] = [];
  for (const it of items) {
    const u = await prisma.ubicacion.findUnique({ where: { assetTag: it.assetTag } });
    if (!u) { changes.push({ assetTag: it.assetTag, skipped: 'NOT_FOUND' }); continue; }
    const to: any = { pallet: it.pallet, cama: it.cama, position: it.position };
    if (it.partida) to.partida = it.partida;
    if (u.pallet === it.pallet && u.cama === it.cama && u.position === it.position && (!it.partida || u.partida === it.partida)) {
      changes.push({ assetTag: it.assetTag, skipped: 'SAME' });
      continue;
    }
    changes.push({ id: u.id, assetTag: it.assetTag,
      from: { pallet: u.pallet, cama: u.cama, position: u.position, partida: u.partida },
      to });
  }

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, changesCount: changes.filter((c) => !c.skipped).length, sample: changes.slice(0, 8) });
  }

  const applied = changes.filter((c) => c.id);
  await prisma.$transaction(async (tx) => {
    // Fase 1: mover a positions temporales para evitar colisiones
    for (const c of applied) {
      await tx.ubicacion.update({ where: { id: c.id }, data: { position: `_tmp_${c.id}` } });
    }
    for (const c of applied) {
      await tx.ubicacion.update({ where: { id: c.id }, data: c.to });
    }
  });

  return NextResponse.json({ ok: true, dry: false, appliedCount: applied.length });
}
