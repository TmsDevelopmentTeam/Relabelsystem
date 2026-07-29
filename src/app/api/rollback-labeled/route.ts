import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rollback de equipos → PENDING (limpia paired/labeled/matched para rehacer el flujo).
// ?type=DESKTOP|LAPTOP|MONITOR : solo ese tipo
// ?from=MATCHED|LABELED|PAIR_READY : status de origen (default LABELED)
// sin from: TODOS los LABELED
export async function POST(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')?.trim();
  const from = (req.nextUrl.searchParams.get('from')?.trim().toUpperCase()) || 'LABELED';
  const where: any = { status: from };
  if (type) where.equipmentType = type;

  const affectedCount = await prisma.equipment.count({ where });

  const res = await prisma.equipment.updateMany({
    where,
    data: {
      status: 'PENDING',
      labeledAt: null, labeledBy: null,
      pairedAt: null, pairedBy: null,
      matchedAt: null, matchedBy: null,
    },
  });

  return NextResponse.json({ ok: true, rolledBack: res.count, from, type: type ?? 'ALL', affectedCount });
}
