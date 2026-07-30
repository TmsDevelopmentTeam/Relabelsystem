import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vista supervisor (solo lectura): lo último escaneado en Cama y en Match, + contadores.
export async function GET() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [camaRecent, matchRecent, rollsRecent, rollsTotal, rollsHoy, camaArmadas, camaTotal, camaHoy, matchHoy, matchedTotal, eqTotal] = await Promise.all([
    prisma.ubicacion.findMany({
      where: { scannedAt: { not: null } },
      orderBy: { scannedAt: 'desc' },
      take: 30,
      select: { assetTag: true, inventario: true, producto: true, partida: true, pallet: true, cama: true, position: true, scannedAt: true, scannedBy: true, ordenDell: true },
    }),
    prisma.scanEvent.findMany({
      where: { step: 'MATCH' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { assetTag: true, inventario: true, boxLabel: true, operator: true, result: true, message: true, createdAt: true },
    }),
    prisma.labelRoll.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { orderNumber: true, value: true, position: true, operator: true, createdAt: true },
    }),
    prisma.labelRoll.count(),
    prisma.labelRoll.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.ubicacion.count({ where: { scannedAt: { not: null } } }),
    prisma.ubicacion.count(),
    prisma.ubicacion.count({ where: { scannedAt: { gte: startOfToday } } }),
    prisma.scanEvent.count({ where: { step: 'MATCH', createdAt: { gte: startOfToday } } }),
    prisma.equipment.count({ where: { status: 'MATCHED' } }),
    prisma.equipment.count(),
  ]);

  return NextResponse.json({
    camaRecent,
    matchRecent,
    rollsRecent,
    counts: { camaArmadas, camaTotal, camaHoy, matchHoy, matchedTotal, eqTotal, rollsTotal, rollsHoy },
    nowISO: new Date().toISOString(),
  });
}
