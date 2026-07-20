import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST: escanear una etiqueta del rollo → se guarda con position consecutivo DENTRO del orderNumber.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const value = norm(body?.value);
    const operator = String(body?.operator ?? 'unknown');
    const orderNumber = String(body?.orderNumber ?? '').trim() || null;
    if (!value) return NextResponse.json({ ok: false, message: 'Vacío' }, { status: 400 });
    if (!orderNumber) return NextResponse.json({ ok: false, message: 'Falta número de orden' }, { status: 400 });

    // Calcular la siguiente posición para esta orden
    const lastForOrder = await prisma.labelRoll.findFirst({
      where: { orderNumber },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const nextPosition = (lastForOrder?.position ?? 0) + 1;

    const created = await prisma.labelRoll.create({
      data: { value, operator, orderNumber, position: nextPosition },
    });

    const totalForOrder = await prisma.labelRoll.count({ where: { orderNumber } });
    const totalOverall = await prisma.labelRoll.count();
    return NextResponse.json({ ok: true, entry: created, totalForOrder, totalOverall });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}

// GET:
//   ?order=X   → items de esa orden
//   ?stats=1   → resumen por orden { order, count }
//   sin nada   → últimos N items sin filtro
export async function GET(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order');
  const stats = req.nextUrl.searchParams.get('stats');
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100);

  if (stats) {
    const grouped = await prisma.labelRoll.groupBy({
      by: ['orderNumber'],
      _count: { _all: true },
    });
    const overall = await prisma.labelRoll.count();
    return NextResponse.json({
      overall,
      orders: grouped.map((g) => ({ orderNumber: g.orderNumber, count: g._count._all }))
        .sort((a, b) => (a.orderNumber ?? '').localeCompare(b.orderNumber ?? '')),
    });
  }

  if (order) {
    const [items, count, available, consumed] = await Promise.all([
      prisma.labelRoll.findMany({
        where: { orderNumber: order },
        orderBy: { position: 'desc' },
        take: limit,
      }),
      prisma.labelRoll.count({ where: { orderNumber: order } }),
      prisma.labelRoll.count({ where: { orderNumber: order, status: 'AVAILABLE' } }),
      prisma.labelRoll.count({ where: { orderNumber: order, status: 'CONSUMED' } }),
    ]);
    return NextResponse.json({ order, items, count, available, consumed });
  }

  // fallback: todos
  const [items, total, available, consumed] = await Promise.all([
    prisma.labelRoll.findMany({ orderBy: { id: 'desc' }, take: limit }),
    prisma.labelRoll.count(),
    prisma.labelRoll.count({ where: { status: 'AVAILABLE' } }),
    prisma.labelRoll.count({ where: { status: 'CONSUMED' } }),
  ]);
  return NextResponse.json({ items, total, available, consumed });
}

// DELETE ?id=N    : borra una entrada específica
// DELETE ?order=X : borra TODA la orden
// DELETE (sin nada): borra TODO
export async function DELETE(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get('id');
  const orderParam = req.nextUrl.searchParams.get('order');
  if (idParam) {
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    await prisma.labelRoll.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: id });
  }
  if (orderParam) {
    const res = await prisma.labelRoll.deleteMany({ where: { orderNumber: orderParam } });
    return NextResponse.json({ ok: true, deletedForOrder: orderParam, count: res.count });
  }
  const res = await prisma.labelRoll.deleteMany();
  return NextResponse.json({ ok: true, deletedAll: res.count });
}
