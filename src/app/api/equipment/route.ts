import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Devuelve la IP local del server para acceso multi-PC
export async function GET(req: NextRequest) {
  const assetTag = norm(req.nextUrl.searchParams.get('assetTag'));
  if (!assetTag) return NextResponse.json({ error: 'assetTag requerido' }, { status: 400 });
  const eq = await prisma.equipment.findUnique({ where: { assetTag } });
  if (!eq) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(eq);
}
