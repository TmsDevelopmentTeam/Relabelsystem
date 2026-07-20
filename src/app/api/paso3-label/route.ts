import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PASO ② ETIQUETAR:
// El operador ya tiene la etiqueta en la mano. Escanea el Asset Tag del equipo
// para confirmar cuál es la etiqueta que le va y marcar como LABELED.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scanned = norm(body?.scanned ?? body?.assetTag);
    const operator = String(body?.operator ?? 'unknown');
    if (!scanned) return NextResponse.json({ ok: false, reason: 'MISSING', message: 'Escaneo vacío' }, { status: 400 });

    // Aceptar Asset Tag o Inventario
    const isInventario = /^(AM|EQR)/.test(scanned);
    let eq: any;
    if (isInventario) {
      eq = await prisma.equipment.findFirst({ where: { inventario: scanned, status: { not: 'MATCHED' } } });
    } else {
      eq = await prisma.equipment.findUnique({ where: { assetTag: scanned } });
    }

    if (!eq) {
      await prisma.scanEvent.create({
        data: { step: 'LABEL', assetTag: scanned, operator, result: 'NOT_FOUND', message: 'No encontrado' },
      });
      return NextResponse.json({ ok: false, reason: 'NOT_FOUND', message: `${scanned} no encontrado` });
    }

    if (eq.status === 'MATCHED') {
      await prisma.scanEvent.create({
        data: { step: 'LABEL', assetTag: eq.assetTag, operator, result: 'DUPLICATE', equipmentId: eq.id,
                message: 'Ya MATCHED' },
      });
      return NextResponse.json({
        ok: true, alreadyLabeled: true, equipment: eq,
        message: 'Este equipo ya está verificado (MATCHED)',
      });
    }

    const rollEntry = await prisma.labelRoll.findFirst({
      where: { value: eq.inventario },
      orderBy: { id: 'asc' },
    });
    const rollPosition = rollEntry?.id ?? null;

    // Marcar LABELED si estaba pendiente
    const shouldAdvance = eq.status !== 'LABELED';
    let updated = eq;
    if (shouldAdvance) {
      updated = await prisma.equipment.update({
        where: { id: eq.id },
        data: { status: 'LABELED', labeledAt: new Date(), labeledBy: operator },
      });
    }

    await prisma.scanEvent.create({
      data: { step: 'LABEL', assetTag: eq.assetTag, inventario: eq.inventario, operator, result: 'OK',
              equipmentId: eq.id, message: rollPosition ? `Rollo #${rollPosition}` : null },
    });

    return NextResponse.json({
      ok: true,
      equipment: updated,
      inventario: eq.inventario,
      equipmentType: eq.equipmentType,
      producto: eq.producto,
      rollPosition,
      alreadyLabeled: !shouldAdvance,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
