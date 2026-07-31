'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

type Entry = { id: number; orderNumber: string | null; position: number | null; value: string; status: string; operator: string | null; createdAt: string };
type OrderInfo = { order?: string; modo?: string; partida?: string; pallets?: { pallet: string; count: number }[]; equipmentCount: number; laptopCount?: number; otherCount?: number; expectedLabels?: number; scannedInRoll?: number; remaining?: number; completedPct?: number; complete?: boolean; scannedEquipos?: number; remainingEquipos?: number; completedPctEquipos?: number };

export default function RollosPage() {
  const op = useOperator();
  const [operator, setOperator] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [scanning, setScanning] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ order: string; items: Entry[]; count: number; available: number; consumed: number } | null>(null);
  const [ordersSummary, setOrdersSummary] = useState<{ orders: { orderNumber: string | null; count: number }[]; overall: number } | null>(null);
  const [partSummary, setPartSummary] = useState<{ partidas: { partida: string; totalEquipos: number; escaneados: number; pallets: { pallet: string; equipos: number; escaneados: number; completo: boolean }[] }[] } | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  const [wrongOrder, setWrongOrder] = useState<{ scanned: string; expectedOrder: string; equipment: any } | null>(null);
  const [lastConfirm, setLastConfirm] = useState<{ position: number; value: string; equipment: any; equipoNum?: number | null; totalEquiposEnRollo?: number; etiquetasDeEsteEquipo?: number } | null>(null);

  useEffect(() => {
    setOperator(op.get());
    const savedOrder = typeof window !== 'undefined' ? localStorage.getItem('currentOrder') ?? '' : '';
    setOrderNumber(savedOrder);
  }, []);

  useEffect(() => {
    if (orderNumber) { load(); loadInfo(); }
    loadSummary();
    setScanning(false); // al cambiar de orden, se detiene el scan
  }, [orderNumber]);

  function saveOrder(v: string) {
    setOrderNumber(v);
    if (typeof window !== 'undefined') localStorage.setItem('currentOrder', v);
  }

  async function load() {
    if (!orderNumber) { setData(null); return; }
    const res = await fetch(`/api/rollos?order=${encodeURIComponent(orderNumber)}&limit=200`, { cache: 'no-store' });
    setData(await res.json());
  }
  async function loadInfo() {
    if (!orderNumber) { setOrderInfo(null); return; }
    const res = await fetch(`/api/rollos/order-info?order=${encodeURIComponent(orderNumber)}`, { cache: 'no-store' });
    setOrderInfo(await res.json());
  }
  async function loadSummary() {
    const res = await fetch('/api/rollos?stats=1', { cache: 'no-store' });
    setOrdersSummary(await res.json());
    try {
      const rp = await fetch('/api/rollos/partida-summary', { cache: 'no-store' });
      setPartSummary(await rp.json());
    } catch {}
  }

  async function submit(force = false) {
    const scannedVal = value.trim();
    if (!scannedVal || busy) return;
    if (!orderNumber.trim()) { alert('Selecciona una orden arriba'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/rollos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: scannedVal, operator, orderNumber, force }),
      });
      const json = await res.json();
      if (json.ok) {
        beepOK();
        setLastId(json.entry.id);
        setLastConfirm({
          position: json.entry.position, value: json.entry.value, equipment: json.equipment,
          equipoNum: json.equipoNum, totalEquiposEnRollo: json.totalEquiposEnRollo,
          etiquetasDeEsteEquipo: json.etiquetasDeEsteEquipo,
        });
        setWrongOrder(null);
        await load(); await loadInfo(); await loadSummary();
        setValue('');
      } else if (json.reason === 'WRONG_ORDER') {
        siren();
        setWrongOrder({ scanned: json.scanned, expectedOrder: json.expectedOrder, equipment: json.equipment });
      } else if (json.reason === 'NOT_IN_CATALOG') {
        siren();
        alert(`⚠️ ${json.message}`);
        setValue('');
      } else if (json.reason === 'ALREADY_SCANNED') {
        siren();
        alert(`🔁 ${json.message}\n\nEsta etiqueta ya se escaneó lo esperado. Si aún así quieres agregarla, usa "Forzar" con precaución.`);
        setValue('');
      } else {
        siren();
      }
    } catch { siren(); } finally { setBusy(false); }
  }

  async function acceptWrongOrder() {
    if (!wrongOrder) return;
    saveOrder(wrongOrder.expectedOrder);
    setTimeout(() => submit(false), 200);
    setWrongOrder(null);
  }

  async function deleteOne(id: number) {
    if (!confirm(`¿Borrar la entrada #${id}?`)) return;
    await fetch(`/api/rollos?id=${id}`, { method: 'DELETE' });
    load(); loadInfo(); loadSummary();
  }

  async function deleteOrder() {
    if (!orderNumber || !confirm(`¿Borrar TODAS las etiquetas de la orden ${orderNumber}? Solo esta orden.`)) return;
    await fetch(`/api/rollos?order=${encodeURIComponent(orderNumber)}`, { method: 'DELETE' });
    setLastId(null); load(); loadInfo(); loadSummary();
  }

  // Reinicia SOLO este rollo (partida/pallet u orden) a 0 — con backup automático primero.
  async function resetRoll() {
    if (!orderNumber) return;
    if (!confirm(`¿Reiniciar el rollo "${orderNumber}" a 0 escaneos?\n\nSolo este rollo. Se hace un respaldo automático de la base antes.`)) return;
    try {
      const bk = await fetch(`/api/admin/backup?motivo=reset_rollo`, { cache: 'no-store' }).then((r) => r.json());
      if (!bk.ok) { alert('No se pudo respaldar la base. NO se reinició el rollo.\n' + (bk.error || '')); return; }
      const res = await fetch(`/api/rollos?order=${encodeURIComponent(orderNumber)}`, { method: 'DELETE' }).then((r) => r.json());
      alert(`✅ Rollo "${orderNumber}" reiniciado a 0 (borradas ${res.count ?? 0}).\nRespaldo: ${bk.backup}`);
      setLastId(null); load(); loadInfo(); loadSummary();
    } catch (e: any) { alert('Error: ' + (e?.message || e)); }
  }

  async function renumberOrder() {
    if (!orderNumber || !confirm(`¿Renumerar la orden ${orderNumber} a 1..N?`)) return;
    await fetch(`/api/rollos/renumber?order=${encodeURIComponent(orderNumber)}`, { method: 'POST' });
    load(); loadInfo();
  }

  const nextPosition = (data?.count ?? 0) + 1;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black text-white">🎞️ Rollos de etiquetas</h1>
          <p className="text-slate-400 text-sm">
            Elige orden → presiona <b>▶ Start Scan</b> → escanea. El sistema cuenta contra el total esperado del Excel.
          </p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-400">Operador:</span>
          <input value={operator} onChange={(e)=>{setOperator(e.target.value); op.set(e.target.value);}}
            placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40"/>
        </label>
      </div>

      {/* Selector de orden */}
      <div className="rounded-lg bg-slate-900 border-2 border-cyan-500 p-4">
        <label className="block text-sm text-slate-300 mb-2">Orden o <b className="text-cyan-300">Partida</b> (los rollos ahora van por partida: ej. <span className="font-mono">1520 D</span>)</label>
        <div className="flex gap-2 flex-wrap">
          <input
            value={orderNumber}
            onChange={(e) => saveOrder(e.target.value.trim())}
            placeholder="Ej. 1520 D  ·  ó una orden 1031565130"
            className="flex-1 rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xl font-mono text-white"
          />
          {ordersSummary && ordersSummary.orders.length > 0 && (
            <select
              value={orderNumber}
              onChange={(e) => saveOrder(e.target.value)}
              className="rounded bg-slate-800 border border-slate-700 px-2 py-2 text-sm text-white"
            >
              <option value="">— Elegir orden previa —</option>
              {ordersSummary.orders.map((o) => (
                <option key={o.orderNumber ?? 'null'} value={o.orderNumber ?? ''}>
                  {o.orderNumber ?? '(sin orden)'} · {o.count}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Selección de PALLET cuando se eligió una partida (rollos por pallet) */}
        {orderInfo && orderInfo.modo === 'partida-lista' && orderInfo.pallets && (
          <div className="mt-3 rounded bg-black/40 p-3">
            <div className="text-sm text-white mb-2">Partida <b className="font-mono">{orderInfo.partida}</b> · elige el <b className="text-cyan-300">PALLET</b> a escanear:</div>
            <div className="flex flex-wrap gap-2">
              {orderInfo.pallets.map((p) => (
                <button key={p.pallet} onClick={() => saveOrder(`${orderInfo.partida} · P${p.pallet}`)}
                  className="rounded px-3 py-2 text-sm font-bold border bg-slate-800 border-slate-600 text-slate-100 hover:bg-cyan-700 hover:border-cyan-400">
                  Pallet {p.pallet} <span className="text-slate-400 font-normal">· {p.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {orderInfo && orderInfo.modo !== 'partida-lista' && (orderInfo.equipmentCount ?? 0) > 0 && (
          <div className="mt-3 rounded bg-black/40 p-3">
            <div className="flex justify-between items-center flex-wrap gap-2 text-sm">
              <div className="text-white">
                {orderInfo.modo === 'pallet' && <span className="text-cyan-300 font-bold">📦 {orderInfo.order} · </span>}
                <b>{orderInfo.equipmentCount}</b> equipos ({orderInfo.laptopCount ?? 0} laptop, {orderInfo.otherCount ?? 0} otros)
                {(orderInfo.laptopCount ?? 0) > 0 && (
                  <span className="text-slate-400"> · 2 etiquetas por laptop</span>
                )}
              </div>
              <div className={`font-mono text-lg ${orderInfo.complete ? 'text-emerald-400' : 'text-amber-400'}`}>
                {orderInfo.scannedEquipos ?? orderInfo.scannedInRoll} / {orderInfo.equipmentCount} equipos
                {orderInfo.complete && ' ✅'}
              </div>
            </div>
            <div className="mt-2 h-3 bg-slate-800 rounded overflow-hidden">
              <div className={`h-full transition-all ${orderInfo.complete ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                style={{ width: `${orderInfo.completedPctEquipos ?? orderInfo.completedPct}%` }}/>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Faltan <b>{orderInfo.remainingEquipos ?? orderInfo.remaining}</b> equipos
            </div>
          </div>
        )}

        {orderInfo && orderInfo.equipmentCount === 0 && orderNumber && (
          <div className="mt-3 rounded bg-yellow-500 text-black p-3 text-sm">
            ⚠️ <b>{orderNumber}</b> no existe ni como orden ni como partida. Verifica.
          </div>
        )}

        {/* Partidas de desktop (rollos por partida) */}
        <div className="mt-3">
          <div className="text-xs text-slate-400 mb-1">Partidas de Desktop (toca para elegir):</div>
          <div className="flex flex-wrap gap-1.5">
            {['1520 D', '1540 D', '1550 D', '1560 D', 'Cedros 03 D', 'Cedros 05 D', 'Cedros 07 D', 'Respando D'].map((p) => (
              <button key={p} onClick={() => saveOrder(p)}
                className={`rounded px-2.5 py-1 text-xs font-mono border ${orderNumber === p ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Start/Stop Scan (oculto mientras solo hay partida sin pallet elegido) */}
      {orderNumber && orderInfo?.modo !== 'partida-lista' && (
        <div className="flex gap-2">
          {!scanning ? (
            <button onClick={() => setScanning(true)}
              className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-6 py-4 text-white text-xl font-black shadow-lg">
              ▶ Start Scan
            </button>
          ) : (
            <button onClick={() => setScanning(false)}
              className="flex-1 rounded-lg bg-red-700 hover:bg-red-600 px-6 py-4 text-white text-xl font-black">
              ■ Stop Scan
            </button>
          )}
          <button onClick={resetRoll}
            title="Reinicia solo este rollo a 0 (hace respaldo antes)"
            className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-4 text-white text-base font-black">
            🔄 Reiniciar este rollo a 0
          </button>
        </div>
      )}

      {/* Scan input */}
      {orderNumber && scanning && (
        <div className="rounded-lg bg-slate-900 border-2 border-teal-500 p-5">
          <label className="block text-lg text-slate-200 mb-3">
            Escanea etiqueta → <span className="text-teal-400">
              orden {orderNumber}
              {orderInfo ? ` · equipo ${(orderInfo.scannedEquipos ?? 0)} / ${orderInfo.equipmentCount}` : ''}
            </span>
          </label>
          <ScanInput value={value} onChange={setValue} onSubmit={() => submit(false)} disabled={busy}
            placeholder="Etiqueta…" borderColor="border-teal-500" armed={true}/>
        </div>
      )}

      {/* Confirmación visual del último scan */}
      {lastConfirm && (
        <div className="rounded-lg bg-emerald-700 p-4 text-white border-2 border-white">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs uppercase opacity-80">✅ Guardado · Equipo</div>
              <div className="text-4xl font-black">
                #{lastConfirm.equipoNum ?? lastConfirm.position}
                {lastConfirm.totalEquiposEnRollo ? (
                  <span className="text-xl font-bold opacity-60"> / {lastConfirm.totalEquiposEnRollo}</span>
                ) : null}
              </div>
              <div className="text-xl font-mono mt-1">{lastConfirm.value}</div>
              {(lastConfirm.etiquetasDeEsteEquipo ?? 1) > 1 && (
                <div className="text-xs opacity-80 mt-1">
                  🏷️ etiqueta <b>{lastConfirm.etiquetasDeEsteEquipo}</b> de 2 de este equipo
                </div>
              )}
            </div>
            {lastConfirm.equipment && (
              <div className="text-right">
                <div className="text-xs uppercase opacity-80">Equipo asociado</div>
                <div className="text-lg font-bold">
                  {lastConfirm.equipment.equipmentType === 'LAPTOP' && '💻 '}
                  {lastConfirm.equipment.equipmentType === 'MONITOR' && '📺 '}
                  {lastConfirm.equipment.equipmentType === 'DESKTOP' && '🖥️ '}
                  {lastConfirm.equipment.producto ?? '-'}
                </div>
                <div className="text-sm font-mono opacity-90">Asset Tag: {lastConfirm.equipment.assetTag ?? '-'}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alerta: etiqueta pertenece a otra orden */}
      {wrongOrder && (
        <div className="rounded-lg bg-red-700 p-5 text-white border-4 border-white">
          <div className="text-2xl font-black mb-2">🚨 Etiqueta de OTRA orden</div>
          <div className="mb-3">
            La etiqueta <b className="font-mono text-xl">{wrongOrder.scanned}</b> pertenece a la orden{' '}
            <b className="font-mono text-xl">{wrongOrder.expectedOrder}</b>, no a {orderNumber}.
          </div>
          {wrongOrder.equipment && (
            <div className="text-sm opacity-90 mb-3">
              Equipo: {wrongOrder.equipment.producto} · Asset Tag: {wrongOrder.equipment.assetTag}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <button onClick={acceptWrongOrder}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-white font-bold">
              ✓ Cambiar a orden {wrongOrder.expectedOrder} y guardar
            </button>
            <button onClick={() => { submit(true); }}
              className="rounded bg-yellow-600 hover:bg-yellow-500 px-4 py-2 text-white font-bold">
              ⚠️ Forzar en orden {orderNumber}
            </button>
            <button onClick={() => { setWrongOrder(null); setValue(''); }}
              className="rounded bg-slate-700 hover:bg-slate-600 px-4 py-2 text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Resumen por PARTIDA (rollos por pallet) */}
      {partSummary && partSummary.partidas.length > 0 && (
        <div className="rounded-lg border border-cyan-700 bg-slate-900 p-4">
          <div className="text-sm text-cyan-300 font-bold mb-3">📦 Resumen de rollos por PARTIDA / PALLET</div>
          <div className="space-y-3">
            {partSummary.partidas.map((p) => (
              <div key={p.partida} className="rounded bg-black/40 p-3">
                <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
                  <div className="font-mono font-bold text-white">{p.partida}</div>
                  <div className={`font-mono text-sm ${p.escaneados >= p.totalEquipos ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {p.escaneados} / {p.totalEquipos} equipos
                    {p.escaneados >= p.totalEquipos && ' ✅'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.pallets.map((pl) => (
                    <div key={pl.pallet}
                      className={`rounded px-2 py-1 text-xs font-mono border ${pl.completo ? 'bg-emerald-800/60 border-emerald-500 text-emerald-100' : pl.escaneados > 0 ? 'bg-amber-800/50 border-amber-500 text-amber-100' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
                      title={`Pallet ${pl.pallet}`}>
                      P{pl.pallet}: <b>{pl.escaneados}</b>/{pl.equipos}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumen por orden */}
      {ordersSummary && ordersSummary.orders.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
            <div className="text-sm text-slate-400">📊 Resumen por orden</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ordersSummary.orders.map((o) => (
              <button
                key={o.orderNumber ?? 'null'}
                onClick={() => saveOrder(o.orderNumber ?? '')}
                className={`rounded p-2 text-left text-sm border ${
                  orderNumber === o.orderNumber ? 'border-cyan-400 bg-cyan-900/40' : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                <div className="font-mono text-xs text-slate-400">{o.orderNumber ?? '(sin orden)'}</div>
                <div className="text-white font-bold">{o.count}</div>
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-500 mt-2">Total general: {ordersSummary.overall}</div>
        </div>
      )}

      {/* Tabla de items de la orden actual */}
      {data && data.items.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <div className="text-sm text-slate-400">
              Escaneadas de <b className="text-cyan-300">{orderNumber}</b> (más reciente primero)
            </div>
            <div className="flex gap-2">
              <button onClick={renumberOrder}
                className="rounded bg-teal-700 hover:bg-teal-600 px-3 py-1 text-white text-xs font-bold">
                ↕ Renumerar 1..N
              </button>
              <button onClick={deleteOrder}
                className="rounded bg-red-800 hover:bg-red-700 px-3 py-1 text-white text-xs font-bold">
                ↻ Borrar esta orden
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Pos.</th>
                  <th className="pr-4">Valor</th>
                  <th className="pr-4">Estado</th>
                  <th className="pr-4">Operador</th>
                  <th className="pr-4">Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {data.items.map((e) => (
                  <tr key={e.id} className={`border-b border-slate-800/60 ${e.id === lastId ? 'bg-teal-900/40' : ''}`}>
                    <td className="py-1 pr-4 text-cyan-300 font-bold">#{e.position ?? '?'}</td>
                    <td className="pr-4 text-white text-base">{e.value}</td>
                    <td className="pr-4">
                      <span className={e.status === 'AVAILABLE' ? 'text-teal-400' : 'text-slate-500'}>{e.status}</span>
                    </td>
                    <td className="pr-4">{e.operator ?? '-'}</td>
                    <td className="pr-4 text-slate-400">{new Date(e.createdAt).toLocaleString()}</td>
                    <td>
                      <button onClick={() => deleteOne(e.id)}
                        className="text-red-400 hover:text-red-300 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
