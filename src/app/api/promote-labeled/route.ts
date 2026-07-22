import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Promueve todos los equipos con status=LABELED a status=MATCHED.
// Útil cuando quedaron rezagos por eventos DUPLICATE que no avanzaron
// pero en la práctica ya están matched.
export async function POST(req: NextRequest) {
  const operator = req.nextUrl.searchParams.get('operator') || 'admin-promote';

  const laggards = await prisma.equipment.findMany({
    where: { status: 'LABELED' },
    select: { id: true, assetTag: true, inventario: true },
  });

  const res = await prisma.equipment.updateMany({
    where: { status: 'LABELED' },
    data: { status: 'MATCHED', matchedAt: new Date(), matchedBy: operator },
  });

  return NextResponse.json({
    ok: true,
    promoted: res.count,
    equipments: laggards.slice(0, 20),
  });
}
