import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST: escanear una etiqueta del rollo → se guarda con consecutivo automático.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const value = norm(body?.value);
    const operator = String(body?.operator ?? 'unknown');
    if (!value) return NextResponse.json({ ok: false, message: 'Vacío' }, { status: 400 });

    const created = await prisma.labelRoll.create({
      data: { value, operator },
    });
    const total = await prisma.labelRoll.count();
    return NextResponse.json({ ok: true, entry: created, total });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}

// GET: lista + contadores
export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 50);
  const [items, total, available, consumed] = await Promise.all([
    prisma.labelRoll.findMany({ orderBy: { id: 'desc' }, take: limit }),
    prisma.labelRoll.count(),
    prisma.labelRoll.count({ where: { status: 'AVAILABLE' } }),
    prisma.labelRoll.count({ where: { status: 'CONSUMED' } }),
  ]);
  return NextResponse.json({ items, total, available, consumed });
}

// DELETE ?id=N : borra una entrada específica (por si se equivocaron al escanear)
// DELETE (sin id): borra TODO el rollo
export async function DELETE(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get('id');
  if (idParam) {
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    await prisma.labelRoll.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: id });
  }
  const res = await prisma.labelRoll.deleteMany();
  return NextResponse.json({ ok: true, deletedAll: res.count });
}
