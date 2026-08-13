import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Match KROMA de 3 escaneos:
//   action='lookup'         {value}          → ST CPU de la caja master (afuera). Identifica la caja/pareja.
//   action='verifyCpu'      {boxId, value}   → ST CPU de adentro. Debe == box.stCpu.
//   action='verifyMonitor'  {boxId, value}   → ST monitor de adentro. Debe == box.stMonitor → MATCHED.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action ?? '');
    const operator = String(body?.operator ?? 'unknown');
    const value = norm(body?.value);

    if (action === 'lookup') {
      if (!value) return NextResponse.json({ ok: false, reason: 'EMPTY', message: 'Escaneo vacío' }, { status: 400 });
      const box = await prisma.kromaBox.findUnique({ where: { stCpu: value } });
      if (!box) {
        await prisma.scanEvent.create({ data: { step: 'MATCH', assetTag: value, operator, result: 'NOT_FOUND', message: 'ST CPU de caja no existe en catálogo KROMA' } });
        return NextResponse.json({ ok: false, reason: 'NOT_FOUND', message: `La etiqueta ${value} no está en el catálogo KROMA.`, scanned: value });
      }
      return NextResponse.json({
        ok: true,
        box: {
          id: box.id, cajaLabel: box.cajaLabel,
          usdomCpu: box.usdomCpu, usdomMonitor: box.usdomMonitor,
          stCpu: box.stCpu, stMonitor: box.stMonitor,
          status: box.status, matchedAt: box.matchedAt, matchedBy: box.matchedBy,
        },
        alreadyMatched: box.status === 'MATCHED',
      });
    }

    if (action === 'verifyCpu' || action === 'verifyMonitor') {
      const boxId = Number(body?.boxId);
      if (!boxId) return NextResponse.json({ ok: false, reason: 'NO_BOX', message: 'Falta la caja (escanea primero la etiqueta de la caja).' }, { status: 400 });
      const box = await prisma.kromaBox.findUnique({ where: { id: boxId } });
      if (!box) return NextResponse.json({ ok: false, reason: 'NO_BOX', message: 'Caja no encontrada.' }, { status: 400 });

      if (action === 'verifyCpu') {
        const ok = value === box.stCpu;
        await prisma.scanEvent.create({ data: { step: 'MATCH', assetTag: value, operator, result: ok ? 'OK' : 'MISMATCH', message: ok ? `CPU interno OK (${box.usdomCpu})` : `CPU interno ${value} ≠ caja ${box.stCpu}` } });
        return ok
          ? NextResponse.json({ ok: true, expected: box.stCpu })
          : NextResponse.json({ ok: false, reason: 'MISMATCH', message: `El CPU de adentro (${value}) NO coincide con la caja. Esperado: ${box.stCpu}.`, scanned: value, expected: box.stCpu });
      }

      // verifyMonitor → cierra el match
      const ok = value === box.stMonitor;
      if (!ok) {
        await prisma.scanEvent.create({ data: { step: 'MATCH', assetTag: value, operator, result: 'MISMATCH', message: `Monitor ${value} ≠ pareja ${box.stMonitor}` } });
        return NextResponse.json({ ok: false, reason: 'MISMATCH', message: `El monitor (${value}) NO es la pareja de este CPU. Esperado: ${box.stMonitor}.`, scanned: value, expected: box.stMonitor });
      }
      const already = box.status === 'MATCHED';
      const updated = await prisma.kromaBox.update({
        where: { id: box.id },
        data: already ? {} : { status: 'MATCHED', matchedAt: new Date(), matchedBy: operator },
      });
      await prisma.scanEvent.create({ data: { step: 'MATCH', assetTag: box.stCpu, inventario: box.stMonitor, operator, result: already ? 'DUPLICATE' : 'OK', message: `Caja ${box.cajaLabel ?? ''} MATCHED · CPU ${box.usdomCpu} + Monitor ${box.usdomMonitor}` } });
      return NextResponse.json({
        ok: true, matched: true, alreadyMatched: already,
        box: { id: updated.id, cajaLabel: updated.cajaLabel, usdomCpu: updated.usdomCpu, usdomMonitor: updated.usdomMonitor, stCpu: updated.stCpu, stMonitor: updated.stMonitor },
      });
    }

    return NextResponse.json({ ok: false, message: 'action inválida' }, { status: 400 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
