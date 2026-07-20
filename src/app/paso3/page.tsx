'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

export default function EtiquetarPage() {
  const op = useOperator();
  const [operator, setOperator] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => { setOperator(op.get()); }, []);

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/paso3-label', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ scanned: value, operator }),
      });
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
          <h1 className="text-3xl font-black text-white">② ETIQUETAR (línea)</h1>
          <p className="text-slate-400 text-sm">Escanea el Asset Tag del equipo → sistema te dice qué etiqueta pegar y su posición en el rollo.</p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-400">Operador:</span>
          <input value={operator} onChange={(e)=>{setOperator(e.target.value); op.set(e.target.value);}}
            placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40"/>
        </label>
      </div>

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
        <div className="rounded-lg bg-slate-900 border-2 border-purple-500 p-5">
          <label className="block text-lg text-slate-200 mb-3">Escanea Asset Tag del equipo</label>
          <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
            placeholder="Asset Tag…" borderColor="border-purple-500" armed={true}/>
        </div>
      )}

      {last && (
        <div className={`rounded-lg p-6 ${last.ok ? 'bg-purple-600' : 'bg-red-700'} text-white`}>
          {last.ok ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-black/40 p-4 border-2 border-white">
                <div className="text-xs uppercase opacity-70">📛 Etiqueta a pegar (Inventario)</div>
                <div className="text-4xl font-mono font-bold mt-1">{last.inventario ?? '-'}</div>
              </div>
              {last.rollPosition ? (
                <div className="rounded-xl bg-emerald-700 p-4 border-2 border-white">
                  <div className="text-xs uppercase opacity-90">🎞️ Posición en el rollo</div>
                  <div className="text-6xl font-black mt-1">#{last.rollPosition}</div>
                  {last.rollOrder && (
                    <div className="text-sm opacity-90 mt-1">Orden: <b className="font-mono">{last.rollOrder}</b></div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-yellow-500 text-black p-3 text-sm">
                  ⚠️ Esta etiqueta no está en el rollo pre-cargado. Ve a <b>Rollos</b> y escánenla primero.
                </div>
              )}
              {last.equipmentType === 'LAPTOP' && (
                <div className="rounded-lg bg-yellow-400 text-black p-4 font-bold text-lg">
                  💻 LAPTOP: pega DOS etiquetas iguales en la parte posterior.
                </div>
              )}
              {last.equipmentType === 'MONITOR' && <div className="rounded bg-black/40 p-3">📺 Monitor · 1 etiqueta atrás.</div>}
              {last.equipmentType === 'DESKTOP' && <div className="rounded bg-black/40 p-3">🖥️ CPU · 1 etiqueta en la cara del SN de fábrica.</div>}
              <div className="rounded bg-black/40 p-3 text-sm">
                Producto: <b>{last.producto ?? '-'}</b>
              </div>
              {last.alreadyLabeled && <div className="text-sm opacity-80 mt-1">{last.message}</div>}
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
              <li key={i} className={h.ok ? 'text-emerald-400' : 'text-red-400'}>
                {h.ok
                  ? `✓ ${h.scanned} → ${h.inventario ?? ''} ${h.rollPosition ? `· orden ${h.rollOrder ?? '?'} #${h.rollPosition}` : ''}`
                  : `✗ ${h.scanned} · ${h.reason ?? ''}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
