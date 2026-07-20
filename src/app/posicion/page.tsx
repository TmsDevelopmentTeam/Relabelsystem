'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

export default function PosicionPage() {
  const op = useOperator();
  const [operator, setOperator] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setOperator(op.get());
    const saved = typeof window !== 'undefined' ? localStorage.getItem('posicionOrder') ?? '' : '';
    setOrderNumber(saved);
  }, []);

  function saveOrder(v: string) {
    setOrderNumber(v);
    if (typeof window !== 'undefined') localStorage.setItem('posicionOrder', v);
    setScanning(false);
  }

  async function submit() {
    if (!value.trim() || busy) return;
    if (!orderNumber.trim()) { alert('Captura el número de orden arriba'); return; }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/posicion?assetTag=${encodeURIComponent(value)}&order=${encodeURIComponent(orderNumber)}`,
        { cache: 'no-store' },
      );
      const json = await res.json();
      setLast(json);
      setHistory((h) => [{ ...json, scanned: value, at: new Date() }, ...h].slice(0, 10));
      if (json.ok) beepOK(); else siren();
      setValue('');
    } catch (e:any) {
      setLast({ ok: false, message: e?.message });
      siren();
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black text-white">🔎 Posición en la orden</h1>
          <p className="text-slate-400 text-sm">Captura la orden arriba. Después escanea Asset Tags de esa orden y te digo su posición (1 = inventario más bajo, N = más alto).</p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-400">Operador:</span>
          <input value={operator} onChange={(e)=>{setOperator(e.target.value); op.set(e.target.value);}}
            placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40"/>
        </label>
      </div>

      {/* Selector de orden */}
      <div className="rounded-lg bg-slate-900 border-2 border-cyan-500 p-4">
        <label className="block text-sm text-slate-300 mb-2">Orden que vas a escanear (Orden Dell o PO)</label>
        <input
          value={orderNumber}
          onChange={(e) => saveOrder(e.target.value.trim())}
          placeholder="Ej. 1031673969"
          className="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xl font-mono text-white"
        />
        {orderNumber && (
          <div className="mt-2 text-sm text-cyan-300 font-mono">
            Orden actual: <b>{orderNumber}</b>
          </div>
        )}
      </div>

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

      {scanning && orderNumber && (
        <div className="rounded-lg bg-slate-900 border-2 border-cyan-500 p-5">
          <label className="block text-lg text-slate-200 mb-3">
            Escanea Asset Tag → <span className="text-cyan-400">orden {orderNumber}</span>
          </label>
          <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
            placeholder="Asset Tag…" borderColor="border-cyan-500" armed={true}/>
        </div>
      )}

      {last && (
        <div className={`rounded-lg p-6 ${last.ok ? 'bg-cyan-700' : 'bg-red-700'} text-white`}>
          {last.ok ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-black/40 p-4 border-2 border-white">
                <div className="text-xs uppercase opacity-70">POSICIÓN EN LA ORDEN {last.orderNumber}</div>
                <div className="text-7xl font-black mt-1">#{last.position}</div>
                <div className="text-lg opacity-90 mt-1">de {last.totalInOrder} equipos</div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded bg-black/30 p-3">
                  <div className="text-xs uppercase opacity-70">Asset Tag</div>
                  <div className="text-2xl font-mono mt-1">{last.assetTag}</div>
                </div>
                <div className="rounded bg-black/30 p-3">
                  <div className="text-xs uppercase opacity-70">Inventario</div>
                  <div className="text-2xl font-mono mt-1">{last.inventario}</div>
                </div>
              </div>
              <div className="rounded bg-black/30 p-3 text-sm">
                {last.equipmentType === 'LAPTOP' && '💻 '}
                {last.equipmentType === 'MONITOR' && '📺 '}
                {last.equipmentType === 'DESKTOP' && '🖥️ '}
                {last.producto ?? '-'}
                <span className="opacity-70"> · rango de la orden: {last.firstInventario} … {last.lastInventario}</span>
              </div>
            </div>
          ) : last.reason === 'WRONG_ORDER' ? (
            <div>
              <div className="text-3xl font-black">🚨 EQUIPO DE OTRA ORDEN</div>
              <div className="mt-2 text-lg">
                Este Asset Tag pertenece a la orden <b className="font-mono">{last.realOrder}</b>, no a{' '}
                <b className="font-mono">{last.expectedOrder}</b>.
              </div>
              <div className="mt-3 text-sm bg-black/30 rounded p-3 font-mono">
                Asset: {last.assetTag} · Inventario: {last.inventario} · Producto: {last.producto}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-2xl font-black">❌ {last.reason ?? 'ERROR'}</div>
              <div className="mt-2">{last.message}</div>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 mb-2">Últimos scans</div>
          <ul className="space-y-1 text-sm font-mono">
            {history.map((h, i) => (
              <li key={i} className={h.ok ? 'text-cyan-400' : 'text-red-400'}>
                {h.ok
                  ? `✓ ${h.scanned} → #${h.position}/${h.totalInOrder} · ${h.inventario}`
                  : `✗ ${h.scanned} · ${h.reason ?? ''} ${h.message ?? ''}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
