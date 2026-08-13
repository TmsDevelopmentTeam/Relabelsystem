import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reinicia el match KROMA: todas las cajas vuelven a PENDING.
// NO borra el catálogo. El botón del dashboard hace backup ANTES de llamar esto.
export async function POST() {
  const res = await prisma.kromaBox.updateMany({
    data: { status: 'PENDING', matchedAt: null, matchedBy: null },
  });
  return NextResponse.json({ ok: true, reset: res.count });
}
