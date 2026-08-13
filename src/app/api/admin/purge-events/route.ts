import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Borra ScanEvents de un operador específico. Guardado: exige ?operator= no vacío
// (nunca borra todo por default). Uso puntual (limpiar eventos de prueba).
export async function POST(req: NextRequest) {
  const operator = req.nextUrl.searchParams.get('operator')?.trim();
  if (!operator) {
    return NextResponse.json({ ok: false, message: 'Falta ?operator= (protección: no se borra nada)' }, { status: 400 });
  }
  const res = await prisma.scanEvent.deleteMany({ where: { operator } });
  return NextResponse.json({ ok: true, deleted: res.count, operator });
}
