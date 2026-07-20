'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

export default function Paso2Page() {
  const op = useOperator();
  const [operator, setOperator] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => { setOperator(op.get()); }, []);

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/paso2-pair', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ scanned: value, operator }),
      });
      const json = await res.json();
      setLast(json);
      setHistory((h) => [{...json, scanned: value, at: new Date()}, ...h].slice(0, 8));
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
          <h1 className="text-3xl font-black text-white">② PAIR · Emparejar etiquetas GRANDES</h1>
          <p className="text-slate-400 text-sm">Escanea Asset Tag (SN) o etiqueta grande (AM/EQR) → sistema te dice en qué posición del rollo está la etiqueta.</p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-400">Operador:</span>
          <input value={operator} onChange={(e)=>{setOperator(e.target.value); op.set(e.target.value);}}
            placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40"/>
        </label>
      </div>

      <div className="rounded-lg bg-slate-900 border-2 border-amber-500 p-5">
        <label className="block text-lg text-slate-200 mb-3">Escanea Asset Tag o etiqueta grande</label>
        <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
          placeholder="Etiqueta grande…" borderColor="border-amber-500"/>
      </div>

      {last && (
        <div className={`rounded-lg p-6 ${last.ok ? 'bg-amber-600' : 'bg-red-700'} text-white`}>
          {last.ok ? (
            <div className="space-y-3">
              {last.rollPosition ? (
                <div className="rounded-xl bg-black/40 p-4 border-2 border-white">
                  <div className="text-xs uppercase opacity-70">🎞️ Esta etiqueta está en el ROLLO posición</div>
                  <div className="text-6xl font-black mt-1">#{last.rollPosition}</div>
                </div>
              ) : (
                <div className="text-2xl font-black">📦 COLOCA ESTA ETIQUETA EN CUADRANTE {last.boardCell}</div>
              )}
              {!last.rollPosition && (
                <div className="text-lg opacity-90">Junto con la etiqueta pequeña. Así arman el paquete de etiquetas.</div>
              )}
              {last.alreadyPaired && <div className="text-sm opacity-80 mt-1">{last.message}</div>}
              {last.othersWithSameInventario > 0 && (
                <div className="text-sm bg-black/30 rounded p-2 mt-2">
                  ℹ️ Hay {last.othersWithSameInventario} equipo(s) más con la misma etiqueta ({last.equipment?.inventario}).
                  Escanea el siguiente igual y te dará su ubicación.
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
              <li key={i} className={h.ok ? 'text-emerald-400' : 'text-red-400'}>
                {h.ok ? `✓ ${h.scanned} → ${h.boardCell}` : `✗ ${h.scanned} · ${h.reason ?? ''} ${h.message ?? ''}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
