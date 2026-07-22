import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rollback de equipos en status LABELED → PENDING.
// ?type=DESKTOP|LAPTOP|MONITOR : solo ese tipo
// sin params: TODOS los LABELED
export async function POST(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')?.trim();
  const where: any = { status: 'LABELED' };
  if (type) where.equipmentType = type;

  const affected = await prisma.equipment.findMany({
    where, select: { id: true, assetTag: true, inventario: true, equipmentType: true },
  });

  const res = await prisma.equipment.updateMany({
    where,
    data: {
      status: 'PENDING',
      labeledAt: null, labeledBy: null,
      pairedAt: null, pairedBy: null,
    },
  });

  return NextResponse.json({ ok: true, rolledBack: res.count, affected });
}
