import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Elimina un registro de Ubicacion por assetTag. Admin.
export async function POST(req: NextRequest) {
  const at = req.nextUrl.searchParams.get('assetTag')?.trim();
  if (!at) return NextResponse.json({ error: 'assetTag requerido' }, { status: 400 });
  const u = await prisma.ubicacion.findUnique({ where: { assetTag: at } });
  if (!u) return NextResponse.json({ ok: false, reason: 'NOT_FOUND' });
  await prisma.ubicacion.delete({ where: { id: u.id } });
  return NextResponse.json({ ok: true, deleted: u });
}
