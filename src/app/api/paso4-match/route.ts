import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PASO 4: MATCH final.
// Recibe: smallLabel (etiqueta pegada al equipo), assetTag (SN del equipo), bigLabel (etiqueta caja).
// Los 3 deben pertenecer al mismo registro. Si no, alerta ROJA.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const smallLabel = norm(body?.smallLabel);
    const assetTag = norm(body?.assetTag);
    const bigLabel = norm(body?.bigLabel);
    const operator = String(body?.operator ?? 'unknown');

    if (!smallLabel || !assetTag || !bigLabel) {
      return NextResponse.json({
        ok: false, reason: 'MISSING',
        message: 'Faltan los 3 escaneos (etiqueta pequeña, asset tag, etiqueta caja)',
      });
    }

    const eq = await prisma.equipment.findUnique({ where: { assetTag } });
    if (!eq) {
      await prisma.scanEvent.create({
        data: { step: 'MATCH', assetTag, inventario: smallLabel, boxLabel: bigLabel, operator,
                result: 'NOT_FOUND', message: 'Asset Tag no existe' },
      });
      return NextResponse.json({ ok: false, reason: 'NOT_FOUND', message: `Asset Tag ${assetTag} no encontrado` });
    }

    const expectedInventario = norm(eq.inventario);
    const smallOk = smallLabel === expectedInventario;
    const bigOk = bigLabel === expectedInventario;
    const allOk = smallOk && bigOk;

    if (!allOk) {
      await prisma.scanEvent.create({
        data: { step: 'MATCH', assetTag, inventario: smallLabel, boxLabel: bigLabel, operator,
                result: 'MISMATCH', equipmentId: eq.id,
                message: `Esperado ${expectedInventario}. Pequeña=${smallLabel} ${smallOk?'✓':'✗'} Grande=${bigLabel} ${bigOk?'✓':'✗'}` },
      });
      return NextResponse.json({
        ok: false, reason: 'MISMATCH',
        expected: { inventario: eq.inventario, assetTag: eq.assetTag },
        detail: { smallOk, bigOk, smallLabel, bigLabel },
        message: 'Las etiquetas NO coinciden con el equipo. NO envíes esta caja.',
      });
    }

    if (eq.status === 'MATCHED') {
      await prisma.scanEvent.create({
        data: { step: 'MATCH', assetTag, inventario: smallLabel, boxLabel: bigLabel, operator,
                result: 'DUPLICATE', equipmentId: eq.id, message: 'Ya estaba MATCHED' },
      });
      return NextResponse.json({ ok: true, alreadyMatched: true, equipment: eq, message: 'Ya estaba verificado' });
    }

    const [updated] = await prisma.$transaction([
      prisma.equipment.update({
        where: { id: eq.id },
        data: { status: 'MATCHED', matchedAt: new Date(), matchedBy: operator },
      }),
      prisma.scanEvent.create({
        data: { step: 'MATCH', assetTag, inventario: smallLabel, boxLabel: bigLabel, operator,
                result: 'OK', equipmentId: eq.id },
      }),
    ]);

    return NextResponse.json({ ok: true, equipment: updated });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
