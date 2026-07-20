'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

export default function UbicarPage() {
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanned: value, operator }),
      });
      const json = await res.json();
      setLast(json);
      setHistory((h) => [{ ...json, scanned: value, at: new Date() }, ...h].slice(0, 10));
      if (json.ok) beepOK(); else siren();
      setValue('');
    } catch (e: any) {
      setLast({ ok: false, message: e?.message });
      siren();
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black text-white">① UBICAR ETIQUETA EN EL ROLLO</h1>
          <p className="text-slate-400 text-sm">Escanea el Asset Tag (SN) o la etiqueta (AM/EQR). El sistema te dice en qué posición del rollo está la etiqueta que le toca a este equipo.</p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-400">Operador:</span>
          <input value={operator} onChange={(e)=>{setOperator(e.target.value); op.set(e.target.value);}}
            placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40"/>
        </label>
      </div>

      <div className="rounded-lg bg-slate-900 border-2 border-amber-500 p-5">
        <label className="block text-lg text-slate-200 mb-3">Escanea</label>
        <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
          placeholder="Asset Tag o Inventario…" borderColor="border-amber-500"/>
      </div>

      {last && (
        <div className={`rounded-lg p-6 ${last.ok ? (last.rollPosition ? 'bg-emerald-600' : 'bg-yellow-500 text-black') : 'bg-red-700 text-white'}`}>
          {last.ok ? (
            <div className="space-y-3">
              {last.rollPosition ? (
                <>
                  <div className="text-white">
                    <div className="text-sm uppercase opacity-80">🎞️ POSICIÓN EN EL ROLLO</div>
                    <div className="text-7xl font-black mt-1">#{last.rollPosition}</div>
                    {last.rollOrder && (
                      <div className="text-sm opacity-90 mt-1">Orden: <b className="font-mono">{last.rollOrder}</b></div>
                    )}
                    <div className="text-sm opacity-80 mt-1">Toma la etiqueta de esta posición y pégala al equipo/caja.</div>
                  </div>
                  <div className="rounded bg-black/30 p-3 text-white font-mono">
                    <div className="text-xs uppercase opacity-70">Etiqueta (Inventario)</div>
                    <div className="text-2xl">{last.inventario ?? last.equipment?.inventario}</div>
                    <div className="text-xs uppercase opacity-70 mt-2">Asset Tag del equipo</div>
                    <div className="text-lg">{last.equipment?.assetTag}</div>
                    <div className="text-xs uppercase opacity-70 mt-2">Producto</div>
                    <div>{last.equipment?.producto} {last.equipment?.equipmentType === 'LAPTOP' && '· 💻 LAPTOP (pega 2 etiquetas)'}</div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-3xl font-black">⚠️ ETIQUETA NO ENCONTRADA EN EL ROLLO</div>
                  <div className="text-lg mt-2">
                    La etiqueta <b>{last.inventario ?? last.equipment?.inventario}</b> aún no está registrada en tu rollo.
                  </div>
                  <div className="text-sm mt-2">
                    Ve a <b>🎞️ Rollos</b> y escánenla ahí primero. Después vuelve a intentar aquí.
                  </div>
                </div>
              )}
              {last.othersWithSameInventario > 0 && (
                <div className="text-sm bg-black/30 text-white rounded p-2 mt-2">
                  ℹ️ Hay {last.othersWithSameInventario} equipo(s) más con la misma etiqueta (normal: monitor + CPU comparten activo).
                </div>
              )}
              {last.alreadyPaired && (
                <div className="text-sm bg-black/30 text-white rounded p-2">
                  ℹ️ Este equipo ya había sido ubicado antes.
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
              <li key={i} className={h.ok ? (h.rollPosition ? 'text-emerald-400' : 'text-yellow-400') : 'text-red-400'}>
                {h.ok
                  ? `${h.rollPosition ? '✓' : '⚠'} ${h.scanned} → ${h.inventario ?? h.equipment?.inventario ?? ''} ${h.rollPosition ? `· orden ${h.rollOrder ?? '?'} #${h.rollPosition}` : '· NO en rollo'}`
                  : `✗ ${h.scanned} · ${h.message ?? ''}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
