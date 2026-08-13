'use client';

import { useState } from 'react';

export default function ImportPage() {
  // --- KROMA (nuevo) ---
  const [kFile, setKFile] = useState<File | null>(null);
  const [kWipe, setKWipe] = useState(false);
  const [kBusy, setKBusy] = useState(false);
  const [kResult, setKResult] = useState<any>(null);
  const [kError, setKError] = useState<string | null>(null);

  async function submitKroma() {
    if (!kFile) return;
    setKBusy(true); setKError(null); setKResult(null);
    try {
      const fd = new FormData();
      fd.append('file', kFile);
      if (kWipe) fd.append('wipe', 'true');
      const res = await fetch('/api/kroma/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error');
      setKResult(json);
    } catch (e: any) { setKError(e?.message ?? 'Error'); } finally { setKBusy(false); }
  }

  // --- Telcel (proceso anterior, oculto por defecto) ---
  const [showOld, setShowOld] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [wipe, setWipe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (wipe) fd.append('wipe', 'true');
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error');
      setResult(json);
    } catch (e: any) { setError(e?.message ?? 'Error'); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">📥 Importar catálogo KROMA</h1>
        <p className="text-slate-400 text-sm mt-1">
          Sube el <b>Reporte KROMA Overpacking</b> (columnas <span className="font-mono">USDOMS CPU · SERVICE TAG CPU · USDOMS MONITOR · SERVICE TAG MONITOR · CAJA</span>).
          Cada fila es una caja master (pareja CPU + monitor).
        </p>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-4">
        <input type="file" accept=".xlsx,.xls"
          onChange={(e) => setKFile(e.target.files?.[0] ?? null)} className="block text-sm" />
        <label className="flex items-center gap-2 text-sm text-amber-300">
          <input type="checkbox" checked={kWipe} onChange={(e) => setKWipe(e.target.checked)} />
          Limpiar catálogo KROMA antes de importar (borra las cajas y su estado de match)
        </label>
        <button disabled={!kFile || kBusy} onClick={submitKroma}
          className="rounded bg-sky-600 hover:bg-sky-500 px-4 py-2 text-white font-bold disabled:opacity-50">
          {kBusy ? 'Importando…' : 'Importar KROMA'}
        </button>
      </div>

      {kError && <div className="rounded border border-red-800 bg-red-950 p-3 text-red-200 text-sm">{kError}</div>}
      {kResult && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-4 text-emerald-100 text-sm space-y-1">
          <div><b>Hoja:</b> {kResult.sheet}</div>
          <div><b>Filas leídas:</b> {kResult.leidas} · <b>Insertadas:</b> {kResult.inserted} · <b>Actualizadas:</b> {kResult.updated}</div>
          <div><b>Total en BD:</b> {kResult.totalBD}</div>
          <div><b>Por orden CPU:</b></div>
          <ul className="pl-4 list-disc">
            {Object.entries(kResult.porOrden ?? {}).map(([k, v]: any) => <li key={k}>{k}: {v} cajas</li>)}
          </ul>
          {kResult.totalErrores > 0 && (
            <div className="text-amber-300 mt-2">⚠️ {kResult.totalErrores} filas con problemas:
              <ul className="pl-4 list-disc">{kResult.errores.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* Proceso anterior (Telcel) — oculto */}
      <div className="pt-4 border-t border-slate-800">
        <button onClick={() => setShowOld((s) => !s)} className="text-xs text-slate-500 hover:text-slate-300">
          {showOld ? '▼' : '▶'} Importar proceso anterior (Telcel / Radiomovil)
        </button>
        {showOld && (
          <div className="mt-3 space-y-3">
            <p className="text-slate-500 text-xs">Sube el archivo Radiomovil Dipsa (sheets Equipo computo central / respaldo).</p>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
              <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} /> Limpiar base antes de importar
              </label>
              <button disabled={!file || busy} onClick={submit}
                className="rounded bg-slate-700 hover:bg-slate-600 px-4 py-2 text-white font-bold disabled:opacity-50">
                {busy ? 'Importando…' : 'Importar Telcel'}
              </button>
            </div>
            {error && <div className="rounded border border-red-800 bg-red-950 p-3 text-red-200 text-sm">{error}</div>}
            {result && (
              <div className="rounded border border-emerald-800 bg-emerald-950 p-4 text-emerald-100 text-sm space-y-1">
                <div><b>Total únicos:</b> {result.totalRecords} · <b>Insertados:</b> {result.inserted}</div>
                <ul className="pl-4 list-disc">{result.summaries.map((s: any) => <li key={s.sheet}>{s.sheet}: {s.count}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
