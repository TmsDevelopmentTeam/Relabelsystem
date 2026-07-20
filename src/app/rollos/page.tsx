'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

type Entry = { id: number; orderNumber: string | null; position: number | null; value: string; status: string; operator: string | null; createdAt: string };
type OrderInfo = { order: string; equipmentCount: number; laptopCount: number; otherCount: number; expectedLabels: number; scannedInRoll: number; remaining: number; completedPct: number; complete: boolean };

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
  const [lastId, setLastId] = useState<number | null>(null);

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
  }

  async function submit() {
    if (!value.trim() || busy) return;
    if (!orderNumber.trim()) { alert('Selecciona una orden arriba'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/rollos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, operator, orderNumber }),
      });
      const json = await res.json();
      if (json.ok) {
        beepOK();
        setLastId(json.entry.id);
        await load(); await loadInfo(); await loadSummary();
      } else siren();
      setValue('');
    } catch { siren(); } finally { setBusy(false); }
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

  async function renumberOrder() {
    if (!orderNumber || !confirm(`¿Renumerar la orden ${orderNumber} a 1..N?`)) return;
    await fetch(`/api/rollos/renumber?order=${encodeURIComponent(orderNumber)}`, { method: 'POST' });
    load(); loadInfo();
  }

  async function migrateLegacy() {
    if (!confirm('¿Asignar orden automáticamente a los rollos sin orden? Se busca cada etiqueta en el catálogo importado y se le pone su Orden Dell correspondiente.')) return;
    const res = await fetch('/api/rollos/assign-legacy', { method: 'POST' });
    const j = await res.json();
    alert(`Migrados: ${j.migrated}\nSin orden encontrada: ${j.skipped}`);
    loadSummary(); if (orderNumber) { load(); loadInfo(); }
  }

  const nextPosition = (data?.count ?? 0) + 1;
  const legacyCount = ordersSummary?.orders.find((o) => o.orderNumber === null)?.count ?? 0;

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
        <label className="block text-sm text-slate-300 mb-2">Orden actual (Orden Dell o PO)</label>
        <div className="flex gap-2 flex-wrap">
          <input
            value={orderNumber}
            onChange={(e) => saveOrder(e.target.value.trim())}
            placeholder="Ej. 1031565130"
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

        {orderInfo && orderInfo.equipmentCount > 0 && (
          <div className="mt-3 rounded bg-black/40 p-3">
            <div className="flex justify-between items-center flex-wrap gap-2 text-sm">
              <div className="text-white">
                <b>{orderInfo.equipmentCount}</b> equipos ({orderInfo.laptopCount} laptop, {orderInfo.otherCount} otros)
                → esperadas <b className="text-cyan-300">{orderInfo.expectedLabels}</b> etiquetas
              </div>
              <div className={`font-mono text-lg ${orderInfo.complete ? 'text-emerald-400' : 'text-amber-400'}`}>
                {orderInfo.scannedInRoll} / {orderInfo.expectedLabels}
                {orderInfo.complete && ' ✅'}
              </div>
            </div>
            <div className="mt-2 h-3 bg-slate-800 rounded overflow-hidden">
              <div className={`h-full transition-all ${orderInfo.complete ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                style={{ width: `${orderInfo.completedPct}%` }}/>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Faltan <b>{orderInfo.remaining}</b> · Próxima posición <b>#{nextPosition}</b>
            </div>
          </div>
        )}

        {orderInfo && orderInfo.equipmentCount === 0 && orderNumber && (
          <div className="mt-3 rounded bg-yellow-500 text-black p-3 text-sm">
            ⚠️ La orden <b>{orderNumber}</b> no existe en el Excel importado. Verifica el número.
          </div>
        )}
      </div>

      {/* Start/Stop Scan */}
      {orderNumber && (
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
        </div>
      )}

      {/* Scan input */}
      {orderNumber && scanning && (
        <div className="rounded-lg bg-slate-900 border-2 border-teal-500 p-5">
          <label className="block text-lg text-slate-200 mb-3">
            Escanea etiqueta → <span className="text-teal-400">orden {orderNumber} · posición #{nextPosition}</span>
          </label>
          <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
            placeholder="Etiqueta…" borderColor="border-teal-500" armed={true}/>
        </div>
      )}

      {/* Resumen por orden */}
      {ordersSummary && ordersSummary.orders.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
            <div className="text-sm text-slate-400">📊 Resumen por orden</div>
            {legacyCount > 0 && (
              <button onClick={migrateLegacy}
                className="rounded bg-amber-700 hover:bg-amber-600 px-3 py-1 text-white text-xs font-bold">
                ⚙️ Migrar {legacyCount} sin orden → asignar automático
              </button>
            )}
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
