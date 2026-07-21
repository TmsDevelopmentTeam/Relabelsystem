'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

export default function CamaPage() {
  const op = useOperator();
  const [operator, setOperator] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);

  // Import
  const [file, setFile] = useState<File | null>(null);
  const [wipe, setWipe] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { setOperator(op.get()); }, []);

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cama/lookup?scan=${encodeURIComponent(value)}`, { cache: 'no-store' });
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

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black text-white">🛏️ Cama / Position / Pallet</h1>
          <p className="text-slate-400 text-sm">Escanea Serie (SN Dell) o Inventario y te digo la ubicación física.</p>
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

      {/* Panel de import */}
      {showImport && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-3">
          <div className="font-bold text-white">📥 Importar Excel de ubicaciones</div>
          <div className="text-xs text-slate-400">Se lee el sheet que tenga columnas Cama, Position, Pallet, Serie e Inventario.</div>
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
              {importResult.ok
                ? `Sheet: ${importResult.sheet} · Insertados: ${importResult.inserted} · Total en DB: ${importResult.totalInDB}`
                : `Error: ${importResult.error}`}
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

      {last && (
        <div className={`rounded-lg p-6 ${last.ok ? 'bg-orange-600' : 'bg-red-700'} text-white`}>
          {last.ok ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-black/40 p-4 border-2 border-white text-center">
                  <div className="text-xs uppercase opacity-70">🛏️ CAMA</div>
                  <div className="text-6xl font-black mt-1">{last.cama ?? '—'}</div>
                </div>
                <div className="rounded-xl bg-black/40 p-4 border-2 border-white text-center">
                  <div className="text-xs uppercase opacity-70">📍 POSITION</div>
                  <div className="text-6xl font-black mt-1">{last.position ?? '—'}</div>
                </div>
                <div className="rounded-xl bg-black/40 p-4 border-2 border-white text-center">
                  <div className="text-xs uppercase opacity-70">📦 PALLET</div>
                  <div className="text-6xl font-black mt-1">{last.pallet ?? '—'}</div>
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
                  ? `✓ ${h.scanned} → Cama ${h.cama} · Pos ${h.position} · Pallet ${h.pallet}`
                  : `✗ ${h.scanned} · ${h.message ?? ''}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
