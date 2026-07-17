import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PASO 3: Línea de producción.
// Escanean Asset Tag → sistema dice qué cuadrante tiene el paquete de etiquetas.
// El operador toma esas etiquetas, saca la compu, pega pequeña al equipo y grande a la caja.
// Marca equipo como LABELED y LIBERA el cuadrante.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const assetTag = norm(body?.assetTag);
    const operator = String(body?.operator ?? 'unknown');
    if (!assetTag) return NextResponse.json({ ok: false, reason: 'MISSING', message: 'Asset Tag vacío' }, { status: 400 });

    const eq = await prisma.equipment.findUnique({ where: { assetTag } });
    if (!eq) {
      await prisma.scanEvent.create({
        data: { step: 'LABEL', assetTag, operator, result: 'NOT_FOUND', message: 'Asset Tag no existe' },
      });
      return NextResponse.json({ ok: false, reason: 'NOT_FOUND', message: `Asset Tag ${assetTag} no encontrado` });
    }

    if (eq.status === 'LABELED' || eq.status === 'MATCHED') {
      await prisma.scanEvent.create({
        data: { step: 'LABEL', assetTag, operator, result: 'DUPLICATE', equipmentId: eq.id,
                message: `Ya etiquetado (${eq.status})` },
      });
      return NextResponse.json({
        ok: true, alreadyLabeled: true, equipment: eq,
        message: `Este equipo ya está etiquetado (${eq.status})`,
      });
    }

    if (eq.status !== 'PAIR_READY') {
      await prisma.scanEvent.create({
        data: { step: 'LABEL', assetTag, operator, result: 'ERROR', equipmentId: eq.id,
                message: `Estado inválido: ${eq.status}` },
      });
      return NextResponse.json({
        ok: false, reason: 'NOT_READY',
        message: `Este equipo aún no tiene su paquete de etiquetas emparejado. Estado: ${eq.status}. Completa paso 1 y 2 primero.`,
      });
    }

    const boardCell = eq.boardCell;

    const ops: any[] = [
      prisma.equipment.update({
        where: { id: eq.id },
        data: { status: 'LABELED', labeledAt: new Date(), labeledBy: operator, boardCell: null },
      }),
      prisma.scanEvent.create({
        data: { step: 'LABEL', assetTag, boardCell, inventario: eq.inventario, operator, result: 'OK', equipmentId: eq.id },
      }),
    ];
    if (boardCell) {
      ops.push(prisma.boardSlot.update({
        where: { cell: boardCell },
        data: { equipmentId: null, occupiedAt: null },
      }));
    }
    const [updated] = await prisma.$transaction(ops);

    return NextResponse.json({
      ok: true,
      equipment: updated,
      boardCell,
      inventario: eq.inventario,
      equipmentType: eq.equipmentType,
      producto: eq.producto,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
