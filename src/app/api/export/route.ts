import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const equipment = await prisma.equipment.findMany({
    orderBy: [{ status: 'asc' }, { pedido: 'asc' }, { posicion: 'asc' }],
  });
  const rows = equipment.map((e) => ({
    PO: e.po, 'Orden Dell': e.ordenDell, Producto: e.producto, 'Perfil Imagen': e.perfilImagen,
    Pedido: e.pedido, Posición: e.posicion, SAP: e.sap, Descripción: e.descripcion,
    'Asset Tag (SN)': e.assetTag, Región: e.region, Inventario: e.inventario, Solicitante: e.solicitante,
    'Tipo Etiqueta': e.tipoEtiqueta, 'Tipo Equipo': e.equipmentType,
    Status: e.status, 'Board Cell': e.boardCell,
    'Tagged At': e.taggedAt?.toISOString() ?? '', 'Tagged By': e.taggedBy,
    'Paired At': e.pairedAt?.toISOString() ?? '', 'Paired By': e.pairedBy,
    'Labeled At': e.labeledAt?.toISOString() ?? '', 'Labeled By': e.labeledBy,
    'Matched At': e.matchedAt?.toISOString() ?? '', 'Matched By': e.matchedBy,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Reetiquetado');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="relabelmx-${stamp}.xlsx"`,
    },
  });
}
