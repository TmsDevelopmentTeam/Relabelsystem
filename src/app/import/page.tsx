'use client';

import { useState } from 'react';

export default function ImportPage() {
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
    } catch (e: any) {
      setError(e?.message ?? 'Error');
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-3xl font-black text-white">📥 Importar Excel</h1>
      <p className="text-slate-400 text-sm">
        Sube el archivo <b>Radiomovil Dipsa reporte activos</b>. Se leen los sheets{' '}
        <b>Equipo computo central</b> y <b>Equipo de respaldo</b>.
      </p>

      <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-4">
        <input type="file" accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block text-sm"/>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)}/>
          Limpiar base antes de importar (borra todo)
        </label>
        <button disabled={!file || busy} onClick={submit}
          className="rounded bg-sky-600 hover:bg-sky-500 px-4 py-2 text-white font-bold disabled:opacity-50">
          {busy ? 'Importando…' : 'Importar'}
        </button>
      </div>

      {error && <div className="rounded border border-red-800 bg-red-950 p-3 text-red-200 text-sm">{error}</div>}
      {result && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-4 text-emerald-100 text-sm space-y-1">
          <div><b>Total únicos:</b> {result.totalRecords}</div>
          <div><b>Insertados:</b> {result.inserted}</div>
          <div><b>Por sheet:</b></div>
          <ul className="pl-4 list-disc">
            {result.summaries.map((s:any) => <li key={s.sheet}>{s.sheet}: {s.count}</li>)}
          </ul>
          <div><b>Por tipo:</b></div>
          <ul className="pl-4 list-disc">
            {Object.entries(result.byType).map(([k,v]:any) => <li key={k}>{k}: {v}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
