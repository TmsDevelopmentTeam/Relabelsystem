import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Excel de los equipos que hicieron MATCH hoy (eventos step=MATCH result=OK).
export async function GET() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const events = await prisma.scanEvent.findMany({
    where: { step: 'MATCH', result: 'OK', createdAt: { gte: startOfToday } },
    orderBy: { createdAt: 'asc' },
    select: { assetTag: true, inventario: true, operator: true, createdAt: true, equipmentId: true },
  });

  // dedup por assetTag (si se escaneó más de una vez, dejar el primero)
  const seen = new Set<string>();
  const uniq = events.filter((e) => {
    const k = e.assetTag ?? String(e.equipmentId);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
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
      'Hora Match': e.createdAt.toISOString().slice(0, 19).replace('T', ' '),
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
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 16 }];
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
