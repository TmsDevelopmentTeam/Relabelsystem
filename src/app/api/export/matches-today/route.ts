import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { mxDateTime, mxWeekday, startOfTodayMx } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Excel de los eventos de MATCH de HOY (día de México), en hora de México.
export async function GET() {
  const startOfToday = startOfTodayMx();

  // TODOS los eventos de MATCH de hoy (día México), sin dedup.
  const uniq = await prisma.scanEvent.findMany({
    where: { step: 'MATCH', createdAt: { gte: startOfToday } },
    orderBy: { createdAt: 'asc' },
    select: { assetTag: true, inventario: true, operator: true, createdAt: true, equipmentId: true, result: true, message: true },
  });

  const tags = uniq.map((e) => e.assetTag).filter(Boolean) as string[];
  const [equipos, ubis] = await Promise.all([
    prisma.equipment.findMany({ where: { assetTag: { in: tags } }, select: { assetTag: true, inventario: true, producto: true, equipmentType: true, ordenDell: true, po: true } }),
    prisma.ubicacion.findMany({ where: { assetTag: { in: tags } }, select: { assetTag: true, partida: true, pallet: true, cama: true, position: true } }),
  ]);
  const eqMap = new Map(equipos.map((e) => [e.assetTag, e]));
  const uMap = new Map(ubis.map((u) => [u.assetTag, u]));

  const rows = uniq.map((e, i) => {
    const eq = e.assetTag ? eqMap.get(e.assetTag) : undefined;
    const u = e.assetTag ? uMap.get(e.assetTag) : undefined;
    return {
      '#': i + 1,
      'Día': mxWeekday(e.createdAt),
      'Fecha/Hora (México)': mxDateTime(e.createdAt),
      Resultado: e.result ?? '',
      'Serie (SN)': e.assetTag ?? '',
      Inventario: e.inventario ?? eq?.inventario ?? '',
      Producto: eq?.producto ?? '',
      Tipo: eq?.equipmentType ?? '',
      'Orden Dell': eq?.ordenDell ?? eq?.po ?? '',
      Partida: u?.partida ?? '',
      Pallet: u?.pallet ?? '',
      Cama: u?.cama ?? '',
      Position: u?.position ?? '',
      Operador: e.operator ?? '',
      Mensaje: e.message ?? '',
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 20 }, { wch: 11 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 40 }];
  if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
  XLSX.utils.book_append_sheet(wb, ws, 'Match Hoy');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Match_Hoy_${stamp}.xlsx"`,
    },
  });
}
