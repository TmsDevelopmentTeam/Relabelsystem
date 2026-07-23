import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PASO 4: MATCH final.
// Recibe: smallLabel, assetTag, bigLabel, y para LAPTOPS también smallLabel2.
// Los N valores deben coincidir con el inventario esperado del equipo.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const smallLabel = norm(body?.smallLabel);
    const smallLabel2 = norm(body?.smallLabel2); // opcional (solo laptops)
    const assetTag = norm(body?.assetTag);
    const bigLabel = norm(body?.bigLabel);
    const operator = String(body?.operator ?? 'unknown');

    if (!smallLabel || !assetTag || !bigLabel) {
      return NextResponse.json({
        ok: false, reason: 'MISSING',
        message: 'Faltan los 3 escaneos mínimos (etiqueta pequeña, asset tag, etiqueta caja)',
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

    const isLaptop = eq.equipmentType === 'LAPTOP';

    // Laptops necesitan la segunda etiqueta pequeña
    if (isLaptop && !smallLabel2) {
      return NextResponse.json({
        ok: false, reason: 'NEED_SECOND_SMALL',
        message: 'Este equipo es LAPTOP. Falta escanear la SEGUNDA etiqueta pequeña.',
        equipmentType: 'LAPTOP',
      });
    }

    const expectedInventario = norm(eq.inventario);
    const smallOk = smallLabel === expectedInventario;
    const small2Ok = isLaptop ? smallLabel2 === expectedInventario : true;
    const bigOk = bigLabel === expectedInventario;
    const allOk = smallOk && small2Ok && bigOk;

    if (!allOk) {
      const msgParts = [`Esperado ${expectedInventario}.`, `Pequeña1=${smallLabel} ${smallOk?'✓':'✗'}`];
      if (isLaptop) msgParts.push(`Pequeña2=${smallLabel2} ${small2Ok?'✓':'✗'}`);
      msgParts.push(`Grande=${bigLabel} ${bigOk?'✓':'✗'}`);
      await prisma.scanEvent.create({
        data: { step: 'MATCH', assetTag, inventario: smallLabel, boxLabel: bigLabel, operator,
                result: 'MISMATCH', equipmentId: eq.id, message: msgParts.join(' ') },
      });
      return NextResponse.json({
        ok: false, reason: 'MISMATCH',
        expected: { inventario: eq.inventario, assetTag: eq.assetTag },
        detail: { smallOk, small2Ok, bigOk, smallLabel, smallLabel2, bigLabel, isLaptop },
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
                result: 'OK', equipmentId: eq.id,
                message: isLaptop ? 'LAPTOP · 2 pequeñas validadas' : null },
      }),
    ]);

    return NextResponse.json({ ok: true, equipment: updated, isLaptop });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
