import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { norm } from '@/lib/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST: escanear una etiqueta del rollo → se guarda con position consecutivo DENTRO del orderNumber.
// VALIDA que la etiqueta pertenezca a esa orden (por Equipment.ordenDell). Si no, retorna WRONG_ORDER.
// Con { force: true } se puede saltar la validación (para casos excepcionales).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const value = norm(body?.value);
    const operator = String(body?.operator ?? 'unknown');
    const orderNumber = String(body?.orderNumber ?? '').trim() || null;
    const force = !!body?.force;
    if (!value) return NextResponse.json({ ok: false, message: 'Vacío' }, { status: 400 });
    if (!orderNumber) return NextResponse.json({ ok: false, message: 'Falta número de orden' }, { status: 400 });

    // Validación: la etiqueta debe pertenecer a ESTA orden según el Excel.
    // Ojo: una misma etiqueta puede aparecer en múltiples órdenes (Monitor + CPU
    // comparten el activo pero pueden ser de ordenes Dell distintas). Se acepta
    // si existe AL MENOS UN equipo en la orden actual con este inventario.
    if (!force) {
      const eqInThisOrder = await prisma.equipment.findFirst({
        where: {
          inventario: value,
          OR: [{ ordenDell: orderNumber }, { po: orderNumber }],
        },
        select: { assetTag: true, producto: true, equipmentType: true },
      });
      if (!eqInThisOrder) {
        // No existe en la orden actual → ¿existe en otra?
        const eqOther = await prisma.equipment.findFirst({
          where: { inventario: value },
          select: { ordenDell: true, po: true, assetTag: true, producto: true },
        });
        if (!eqOther) {
          return NextResponse.json({
            ok: false,
            reason: 'NOT_IN_CATALOG',
            message: `La etiqueta ${value} no existe en el Excel importado.`,
            scanned: value,
          });
        }
        const otherOrder = eqOther.ordenDell ?? eqOther.po ?? null;
        return NextResponse.json({
          ok: false,
          reason: 'WRONG_ORDER',
          message: `Esta etiqueta NO está en la orden ${orderNumber}. Existe en la orden ${otherOrder}.`,
          scanned: value,
          expectedOrder: otherOrder,
          currentOrder: orderNumber,
          equipment: { assetTag: eqOther.assetTag, producto: eqOther.producto },
        });
      }
    }

    // Validación de duplicado por orden (no bloquea con force=true).
    // Regla: cada equipo lleva su cantidad de etiquetas físicas según tipo.
    //   - LAPTOP: 2 etiquetas
    //   - MONITOR/DESKTOP/OTHER: 1 etiqueta
    // Si Monitor+CPU comparten activo en la misma orden, el esperado suma ambos.
    if (!force) {
      const equipos = await prisma.equipment.findMany({
        where: {
          inventario: value,
          OR: [{ ordenDell: orderNumber }, { po: orderNumber }],
        },
        select: { equipmentType: true },
      });
      const laptops = equipos.filter((e) => e.equipmentType === 'LAPTOP').length;
      const otros = equipos.length - laptops;
      const expected = laptops * 2 + otros * 1;

      const already = await prisma.labelRoll.count({
        where: { value, orderNumber },
      });

      if (expected > 0 && already >= expected) {
        return NextResponse.json({
          ok: false,
          reason: 'ALREADY_SCANNED',
          message: `La etiqueta ${value} ya se escaneó ${already} vez(es) en la orden ${orderNumber} (máximo esperado: ${expected}).`,
          scanned: value,
          alreadyCount: already,
          expectedCount: expected,
        });
      }
    }

    // Ya validado (o forzado): guardar
    const lastForOrder = await prisma.labelRoll.findFirst({
      where: { orderNumber },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const nextPosition = (lastForOrder?.position ?? 0) + 1;

    const created = await prisma.labelRoll.create({
      data: { value, operator, orderNumber, position: nextPosition },
    });

    // Info del equipo asociado en ESTA orden (para confirmar visualmente al operador)
    const eqInOrder = await prisma.equipment.findFirst({
      where: {
        inventario: value,
        OR: [{ ordenDell: orderNumber }, { po: orderNumber }],
      },
      select: { assetTag: true, producto: true, equipmentType: true },
    });

    const totalForOrder = await prisma.labelRoll.count({ where: { orderNumber } });
    const totalOverall = await prisma.labelRoll.count();
    return NextResponse.json({ ok: true, entry: created, totalForOrder, totalOverall, equipment: eqInOrder });
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
