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
    const force = !!body?.force;
    // Modo PALLET (rollos nuevos por tarima+pallet): body.partida + body.pallet,
    // o un orderNumber compuesto "PARTIDA · P#".
    let partidaSel = String(body?.partida ?? '').trim() || null;
    let palletSel = String(body?.pallet ?? '').trim() || null;
    const rawOrder = String(body?.orderNumber ?? '').trim() || null;
    if (!(partidaSel && palletSel) && rawOrder) {
      const m = rawOrder.match(/^(.+) · P(.+)$/);
      if (m) { partidaSel = m[1]; palletSel = m[2]; }
    }
    const palletMode = !!(partidaSel && palletSel);
    const orderNumber = palletMode ? `${partidaSel} · P${palletSel}` : rawOrder;
    if (!value) return NextResponse.json({ ok: false, message: 'Vacío' }, { status: 400 });
    if (!orderNumber) return NextResponse.json({ ok: false, message: 'Falta orden o partida+pallet' }, { status: 400 });

    // --- Validación en modo PALLET: la etiqueta debe estar en ese pallet de esa partida ---
    if (palletMode && !force) {
      const enPallet = await prisma.ubicacion.findFirst({
        where: { inventario: value, partida: partidaSel!, pallet: palletSel! },
        select: { id: true },
      });
      if (!enPallet) {
        // Monitor y CPU comparten inventario. Al cargar un rollo de CPU (partida "…D")
        // hay que referenciar el equipo de la MISMA partida (el CPU), NO el monitor
        // con el que comparte el número de inventario. Así el mensaje/botón apuntan
        // al pallet correcto (ej. 1520 D · P30) en vez de al monitor (1520 M · P13).
        const uSame = await prisma.ubicacion.findFirst({
          where: { inventario: value, partida: partidaSel! },
          select: { partida: true, pallet: true, assetTag: true, producto: true },
        });
        const uOther = uSame ?? await prisma.ubicacion.findFirst({
          where: { inventario: value },
          select: { partida: true, pallet: true, assetTag: true, producto: true },
        });
        if (!uOther) {
          return NextResponse.json({ ok: false, reason: 'NOT_IN_CATALOG', message: `La etiqueta ${value} no existe en Camas.`, scanned: value });
        }
        return NextResponse.json({
          ok: false, reason: 'WRONG_ORDER',
          message: `Esta etiqueta NO va en ${orderNumber}. Va en ${uOther.partida} · P${uOther.pallet}.`,
          scanned: value, expectedOrder: `${uOther.partida} · P${uOther.pallet}`, currentOrder: orderNumber,
          equipment: { assetTag: uOther.assetTag, producto: uOther.producto },
        });
      }
      // dedup: 1 etiqueta por CPU (2 si laptop) en este pallet
      const u = await prisma.ubicacion.findFirst({ where: { inventario: value, partida: partidaSel!, pallet: palletSel! }, select: { producto: true } });
      const expected = /pro 14|pc14250|laptop/i.test(String(u?.producto ?? '')) ? 2 : 1;
      const already = await prisma.labelRoll.count({ where: { value, orderNumber } });
      if (already >= expected) {
        return NextResponse.json({ ok: false, reason: 'ALREADY_SCANNED', message: `La etiqueta ${value} ya se escaneó ${already} vez(es) en ${orderNumber} (máx: ${expected}).`, scanned: value, alreadyCount: already, expectedCount: expected });
      }
    }

    // Validación: la etiqueta debe pertenecer a ESTA orden según el Excel.
    // Ojo: una misma etiqueta puede aparecer en múltiples órdenes (Monitor + CPU
    // comparten el activo pero pueden ser de ordenes Dell distintas). Se acepta
    // si existe AL MENOS UN equipo en la orden actual con este inventario.
    if (!force && !palletMode) {
      const eqInThisOrder = await prisma.equipment.findFirst({
        where: {
          inventario: value,
          OR: [{ ordenDell: orderNumber }, { po: orderNumber }],
        },
        select: { assetTag: true, producto: true, equipmentType: true },
      });
      // NUEVO: si no matchea como orden, aceptar si la etiqueta pertenece a la
      // PARTIDA indicada (rollos por partida, ej. orderNumber = "1520 D").
      const enEstaPartida = eqInThisOrder ? true : !!(await prisma.ubicacion.findFirst({
        where: { inventario: value, partida: orderNumber },
        select: { id: true },
      }));
      if (!eqInThisOrder && !enEstaPartida) {
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
    if (!force && !palletMode) {
      const equipos = await prisma.equipment.findMany({
        where: {
          inventario: value,
          OR: [{ ordenDell: orderNumber }, { po: orderNumber }],
        },
        select: { equipmentType: true },
      });
      let expected: number;
      if (equipos.length > 0) {
        const laptops = equipos.filter((e) => e.equipmentType === 'LAPTOP').length;
        const otros = equipos.length - laptops;
        expected = laptops * 2 + otros * 1;
      } else {
        // modo partida: 1 etiqueta por equipo (2 si es laptop)
        const u = await prisma.ubicacion.findFirst({ where: { inventario: value, partida: orderNumber }, select: { producto: true } });
        expected = u ? (/pro 14|pc14250|laptop/i.test(String(u.producto ?? '')) ? 2 : 1) : 0;
      }

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

    // Info del equipo asociado (para confirmar visualmente al operador).
    // Primero por orden; si no, por partida (Ubicacion).
    let eqInOrder: any = await prisma.equipment.findFirst({
      where: {
        inventario: value,
        OR: [{ ordenDell: orderNumber }, { po: orderNumber }],
      },
      select: { assetTag: true, producto: true, equipmentType: true },
    });
    if (!eqInOrder) {
      const whereU = palletMode
        ? { inventario: value, partida: partidaSel!, pallet: palletSel! }
        : { inventario: value, partida: orderNumber };
      const u = await prisma.ubicacion.findFirst({ where: whereU, select: { assetTag: true, producto: true } });
      if (u) eqInOrder = { assetTag: u.assetTag, producto: u.producto, equipmentType: /pro 14|pc14250|laptop/i.test(String(u.producto ?? '')) ? 'LAPTOP' : null };
    }

    // El operador cuenta EQUIPOS, no etiquetas: una laptop lleva 2 etiquetas
    // repetidas (mismo inventario), así que las positions crudas llegan a 96
    // para 48 laptops. Renumeramos por inventario distinto en orden de
    // aparición → equipoNum 1..48. Para monitor/CPU el número no cambia.
    const rollAll = await prisma.labelRoll.findMany({
      where: { orderNumber },
      orderBy: { position: 'asc' },
      select: { value: true },
    });
    const ordinalPorValor = new Map<string, number>();
    for (const r of rollAll) {
      if (!ordinalPorValor.has(r.value)) ordinalPorValor.set(r.value, ordinalPorValor.size + 1);
    }
    const equipoNum = ordinalPorValor.get(value) ?? null;
    const totalEquiposEnRollo = ordinalPorValor.size;
    const etiquetasDeEsteEquipo = rollAll.filter((r) => r.value === value).length;

    const totalForOrder = rollAll.length;
    const totalOverall = await prisma.labelRoll.count();
    return NextResponse.json({
      ok: true,
      entry: created,
      equipoNum,               // # de EQUIPO en el rollo (1..48)
      totalEquiposEnRollo,
      etiquetasDeEsteEquipo,   // 2 para laptop, 1 para monitor/CPU
      totalForOrder,           // # de etiquetas físicas (1..96)
      totalOverall,
      equipment: eqInOrder,
    });
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
    if (!orderParam.trim()) {
      return NextResponse.json({ error: 'order vacío: no se borra nada (protección)' }, { status: 400 });
    }
    const res = await prisma.labelRoll.deleteMany({ where: { orderNumber: orderParam } });
    return NextResponse.json({ ok: true, deletedForOrder: orderParam, count: res.count });
  }
  // BLINDAJE: borrar TODO solo con confirmación explícita ?all=CONFIRMAR.
  if (req.nextUrl.searchParams.get('all') !== 'CONFIRMAR') {
    return NextResponse.json({ error: 'Para borrar TODOS los rollos usa ?all=CONFIRMAR. Sin eso, no se borra nada.' }, { status: 400 });
  }
  const res = await prisma.labelRoll.deleteMany();
  return NextResponse.json({ ok: true, deletedAll: res.count });
}
