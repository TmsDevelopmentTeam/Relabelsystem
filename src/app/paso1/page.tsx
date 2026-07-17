'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

export default function Paso1Page() {
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
      const res = await fetch('/api/paso1-tag', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ assetTag: value, operator }),
      });
      const json = await res.json();
      setLast(json);
      setHistory((h) => [{...json, at: new Date()}, ...h].slice(0, 8));
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
          <h1 className="text-3xl font-black text-white">① TAG · Ubicar Asset Tags en el tablero</h1>
          <p className="text-slate-400 text-sm">Escanea el Asset Tag de cada equipo → se asigna cuadrante automático (llenado vertical A1..A10, B1..B10…).</p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-400">Operador:</span>
          <input value={operator} onChange={(e)=>{setOperator(e.target.value); op.set(e.target.value);}}
            placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40"/>
        </label>
      </div>

      <div className="rounded-lg bg-slate-900 border-2 border-sky-500 p-5">
        <label className="block text-lg text-slate-200 mb-3">Escanea Asset Tag</label>
        <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
          placeholder="Asset Tag…" borderColor="border-sky-500" />
      </div>

      {last && (
        <div className={`rounded-lg p-6 ${last.ok ? 'bg-emerald-600' : 'bg-red-700'} text-white`}>
          {last.ok ? (
            <div className="space-y-3">
              <div className="text-2xl font-black">✅ UBICADO EN CUADRANTE {last.boardCell}</div>
              {last.alreadyPlaced && <div className="text-sm opacity-80">{last.message}</div>}
              {last.equipment && (
                <div className="grid sm:grid-cols-2 gap-3 mt-2">
                  <Field label="Asset Tag" value={last.equipment.assetTag} />
                  <Field label="Inventario (etiqueta)" value={last.equipment.inventario} />
                  <Field label="Producto" value={last.equipment.producto ?? '-'} />
                  <Field label="Tipo" value={last.equipment.equipmentType} />
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
                {h.ok ? `✓ ${h.equipment?.assetTag} → ${h.boardCell}` : `✗ ${h.reason ?? ''} ${h.message ?? ''}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-black/30 p-3">
      <div className="text-xs uppercase text-white/70">{label}</div>
      <div className="font-mono text-white text-xl mt-1">{value}</div>
    </div>
  );
}
