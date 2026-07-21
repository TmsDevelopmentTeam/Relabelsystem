'use client';

import { useEffect, useRef, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

type Item = { id: number; assetTag: string; inventario: string; cama: string | null; position: string | null; pallet: string | null; partida: string | null };
type OrderList = { order: string; total: number; items: Item[] };

export default function CamaPage() {
  const op = useOperator();
  const [operator, setOperator] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [orderList, setOrderList] = useState<OrderList | null>(null);
  const [scannedIds, setScannedIds] = useState<Set<string>>(new Set()); // assetTags escaneados en esta sesión
  const [allOrders, setAllOrders] = useState<{ orderNumber: string; total: number; assetTags: string[] }[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Import
  const [file, setFile] = useState<File | null>(null);
  const [wipe, setWipe] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { setOperator(op.get()); loadAllOrders(); }, []);

  async function loadAllOrders() {
    const res = await fetch('/api/cama/orders', { cache: 'no-store' });
    const j = await res.json();
    setAllOrders(j.orders ?? []);
  }

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cama/lookup?scan=${encodeURIComponent(value)}`, { cache: 'no-store' });
      const json = await res.json();
      setLast(json);
      setHistory((h) => [{ ...json, scanned: value, at: new Date() }, ...h].slice(0, 10));
      if (json.ok) {
        beepOK();
        setScannedIds((s) => new Set([...s, json.assetTag]));
        // Si cambia la orden, cargar la lista nueva
        if (json.ordenDell && (!orderList || orderList.order !== json.ordenDell)) {
          loadOrderList(json.ordenDell);
        }
      } else siren();
      setValue('');
    } catch (e:any) {
      setLast({ ok: false, message: e?.message });
      siren();
    } finally { setBusy(false); }
  }

  async function loadOrderList(order: string) {
    const res = await fetch(`/api/cama/order-list?order=${encodeURIComponent(order)}`, { cache: 'no-store' });
    setOrderList(await res.json());
  }

  // Autoscroll al item actual
  useEffect(() => {
    if (!last?.ok || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-asset="${last.assetTag}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [last]);

  async function doImport() {
    if (!file) return;
    setImportBusy(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (wipe) fd.append('wipe', 'true');
      const res = await fetch('/api/cama/import', { method: 'POST', body: fd });
      const json = await res.json();
      setImportResult(json);
    } catch (e:any) {
      setImportResult({ error: e?.message ?? 'Error' });
    } finally { setImportBusy(false); }
  }

  // Index del item actual en la lista y siguiente
  const currentIdx = last?.ok && orderList
    ? orderList.items.findIndex((i) => i.assetTag === last.assetTag)
    : -1;
  const nextItem = currentIdx >= 0 && orderList ? orderList.items[currentIdx + 1] ?? null : null;

  // Detectar si la orden actual está completa (todos sus items en scannedIds)
  const currentOrderDone = !!orderList && orderList.items.length > 0
    && orderList.items.every((i) => scannedIds.has(i.assetTag));

  // Siguiente orden a trabajar: la primera pendiente/en progreso en el panel de órdenes
  const nextOrder = currentOrderDone
    ? allOrders.find((o) => {
        if (o.orderNumber === orderList?.order) return false;
        const doneCount = o.assetTags.filter((t) => scannedIds.has(t)).length;
        return doneCount < o.total;
      })
    : null;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black text-white">🛏️ Cama / Position / Pallet</h1>
          <p className="text-slate-400 text-sm">Escanea Serie (SN Dell) o Inventario. Al lado ves la lista de la orden en el orden del file para saber cuál sigue.</p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setShowImport((v) => !v)}
            className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-white text-xs font-bold">
            {showImport ? '× cerrar' : '📥 Importar'}
          </button>
          <label className="text-sm flex items-center gap-2">
            <span className="text-slate-400">Operador:</span>
            <input value={operator} onChange={(e)=>{setOperator(e.target.value); op.set(e.target.value);}}
              placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40"/>
          </label>
        </div>
      </div>

      {showImport && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-3">
          <div className="font-bold text-white">📥 Importar Excel de ubicaciones</div>
          <div className="text-xs text-slate-400">Lee TODOS los sheets con columnas Cama/Position/Pallet/Serie/Inventario. Upsert por assetTag.</div>
          <input type="file" accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm"/>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)}/>
            Limpiar tabla antes de importar (borra todo)
          </label>
          <button disabled={!file || importBusy} onClick={doImport}
            className="rounded bg-sky-600 hover:bg-sky-500 px-4 py-2 text-white font-bold disabled:opacity-50">
            {importBusy ? 'Importando…' : 'Importar'}
          </button>
          {importResult && (
            <div className={`rounded p-3 text-sm ${importResult.ok ? 'bg-emerald-950 text-emerald-100' : 'bg-red-950 text-red-100'}`}>
              {importResult.ok ? (
                <>
                  <div><b>Total en DB:</b> {importResult.totalInDB}</div>
                  <ul className="list-disc pl-5 mt-1">
                    {importResult.summaries.map((s:any) => (
                      <li key={s.sheet}>
                        <b>{s.sheet}</b>: {s.recordsValid} filas · {s.inserted} nuevas · {s.updated} actualizadas
                      </li>
                    ))}
                  </ul>
                  {importResult.skippedSheets?.length > 0 && (
                    <div className="mt-2 text-xs opacity-80">Sheets omitidos: {importResult.skippedSheets.join(', ')}</div>
                  )}
                </>
              ) : `Error: ${importResult.error}`}
            </div>
          )}
        </div>
      )}

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

      {scanning && (
        <div className="rounded-lg bg-slate-900 border-2 border-orange-500 p-5">
          <label className="block text-lg text-slate-200 mb-3">Escanea Serie o Inventario</label>
          <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
            placeholder="Serie / Inventario…" borderColor="border-orange-500" armed={true}/>
        </div>
      )}

      {/* Panel de órdenes */}
      {allOrders.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 mb-2">
            📋 Órdenes ({allOrders.length}) — verde = completa, naranja = en progreso
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2">
            {allOrders.map((o) => {
              const doneCount = o.assetTags.filter((t) => scannedIds.has(t)).length;
              const isDone = doneCount === o.total;
              const isInProgress = doneCount > 0 && !isDone;
              const isCurrent = last?.ok && last.ordenDell === o.orderNumber;
              let cls = 'rounded p-2 text-xs border transition';
              if (isDone) cls += ' bg-emerald-700 border-emerald-300 text-white font-bold';
              else if (isCurrent) cls += ' bg-orange-500 border-white text-white font-bold ring-2 ring-white';
              else if (isInProgress) cls += ' bg-amber-800 border-amber-500 text-amber-100';
              else cls += ' bg-slate-950 border-slate-700 text-slate-400';
              return (
                <button key={o.orderNumber}
                  onClick={() => loadOrderList(o.orderNumber)}
                  className={cls}>
                  <div className="font-mono truncate">{o.orderNumber}</div>
                  <div>{doneCount}/{o.total} {isDone && '✓'}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Layout: resultado + panel lateral */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {last && (
            <div className={`rounded-lg p-6 ${last.ok ? 'bg-orange-600' : 'bg-red-700'} text-white`}>
              {last.ok ? (
                <div className="space-y-3">
                  {/* NUEVO ORDEN: Pallet → Cama → Position */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-black/40 p-4 border-2 border-white text-center">
                      <div className="text-xs uppercase opacity-70">📦 PALLET</div>
                      <div className="text-6xl font-black mt-1">{last.pallet ?? '—'}</div>
                    </div>
                    <div className="rounded-xl bg-black/40 p-4 border-2 border-white text-center">
                      <div className="text-xs uppercase opacity-70">🛏️ CAMA</div>
                      <div className="text-6xl font-black mt-1">{last.cama ?? '—'}</div>
                    </div>
                    <div className="rounded-xl bg-black/40 p-4 border-2 border-white text-center">
                      <div className="text-xs uppercase opacity-70">📍 POSITION</div>
                      <div className="text-6xl font-black mt-1">{last.position ?? '—'}</div>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="rounded bg-black/30 p-3">
                      <div className="text-xs uppercase opacity-70">Inventario</div>
                      <div className="text-2xl font-mono mt-1">{last.inventario}</div>
                    </div>
                    <div className="rounded bg-black/30 p-3">
                      <div className="text-xs uppercase opacity-70">Orden Dell</div>
                      <div className="text-2xl font-mono mt-1">{last.ordenDell ?? '-'}</div>
                    </div>
                  </div>
                  <div className="rounded bg-black/30 p-3 text-sm">
                    <b>Serie:</b> <span className="font-mono">{last.assetTag}</span> · <b>Producto:</b> {last.producto ?? '-'} · <b>Partida:</b> {last.partida ?? '-'}
                  </div>
                  {nextItem && (
                    <div className="rounded bg-emerald-500 text-black p-3 font-bold">
                      ➡️ SIGUIENTE: <span className="font-mono">{nextItem.assetTag}</span> (Pallet {nextItem.pallet} · Cama {nextItem.cama} · Pos {nextItem.position})
                    </div>
                  )}
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
                  <li key={i} className={h.ok ? 'text-orange-400' : 'text-red-400'}>
                    {h.ok
                      ? `✓ ${h.scanned} → Pallet ${h.pallet} · Cama ${h.cama} · Pos ${h.position}`
                      : `✗ ${h.scanned} · ${h.message ?? ''}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Panel lateral: lista de la orden */}
        <div className={`rounded-lg border p-4 ${currentOrderDone ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-700 bg-slate-900'}`}>
          {currentOrderDone && (
            <div className="rounded bg-emerald-600 text-white p-3 mb-3 font-bold">
              ✅ ORDEN {orderList?.order} COMPLETA ({orderList?.total}/{orderList?.total})
              {nextOrder && (
                <div className="text-sm font-normal mt-1">
                  ➡️ Siguiente orden pendiente:{' '}
                  <button onClick={() => loadOrderList(nextOrder.orderNumber)}
                    className="underline font-bold hover:no-underline">
                    {nextOrder.orderNumber}
                  </button>
                  {' '}({nextOrder.assetTags.filter((t) => scannedIds.has(t)).length}/{nextOrder.total})
                </div>
              )}
            </div>
          )}
          <div className={`text-sm mb-2 ${currentOrderDone ? 'text-emerald-300' : 'text-slate-400'}`}>
            📋 Orden {orderList?.order ?? '—'} · {orderList?.total ?? 0} equipos
          </div>
          {orderList ? (
            <div ref={listRef} className="max-h-[600px] overflow-y-auto space-y-1 text-xs font-mono">
              {orderList.items.map((it) => {
                const isCurrent = last?.assetTag === it.assetTag;
                const isDone = scannedIds.has(it.assetTag);
                const isNext = nextItem?.assetTag === it.assetTag;
                let cls = 'rounded px-2 py-1.5 border';
                if (isCurrent) cls += ' bg-orange-500 border-white text-white font-bold';
                else if (isNext) cls += ' bg-emerald-600 border-white text-white font-bold';
                else if (isDone) cls += ' bg-slate-800/70 border-emerald-800 text-emerald-400 line-through';
                else cls += ' bg-slate-950 border-slate-700 text-slate-400';
                return (
                  <div key={it.id} data-asset={it.assetTag} className={cls}>
                    <div className="flex justify-between items-center gap-2">
                      <span className="truncate">
                        {isCurrent && '▶ '}
                        {isNext && '⏭ '}
                        {isDone && !isCurrent && '✓ '}
                        {it.assetTag}
                      </span>
                      <span className="opacity-80 text-[10px]">
                        P{it.pallet}/C{it.cama}/{it.position}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">Escanea algo primero — la lista de esa orden aparecerá aquí en el orden del file (Pallet → Cama → Position).</div>
          )}
        </div>
      </div>
    </div>
  );
}
