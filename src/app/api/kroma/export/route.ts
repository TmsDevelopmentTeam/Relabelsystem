import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { mxDateTime } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const boxes = await prisma.kromaBox.findMany({ orderBy: [{ usdomCpu: 'asc' }, { id: 'asc' }] });
  const rows = boxes.map((b) => ({
    'Caja': b.cajaLabel ?? '',
    'USDOM CPU': b.usdomCpu,
    'ST CPU': b.stCpu,
    'USDOM Monitor': b.usdomMonitor,
    'ST Monitor': b.stMonitor,
    'Estado': b.status,
    'Match (México)': mxDateTime(b.matchedAt),
    'Operador': b.matchedBy ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KROMA');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="kroma_match.xlsx"`,
    },
  });
}
