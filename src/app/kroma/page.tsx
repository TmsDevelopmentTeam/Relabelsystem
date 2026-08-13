'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

type Box = {
  id: number; cajaLabel: string | null;
  usdomCpu: string; usdomMonitor: string;
  stCpu: string; stMonitor: string;
  status?: string; matchedAt?: string | null; matchedBy?: string | null;
};

type Info = {
  total: number; matched: number; pendientes: number;
  ordenes: { usdomCpu: string; usdomMonitor: string; total: number; matched: number }[];
};

// 0 = escanea caja (ST CPU afuera) · 1 = ST CPU adentro · 2 = ST monitor adentro
export default function KromaPage() {
  const op = useOperator();
  const [operator, setOperator] = useState('');
  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  const [box, setBox] = useState<Box | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; expected?: string } | null>(null);
  const [done, setDone] = useState<Box | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => { setOperator(op.get()); loadInfo(); }, []);
  async function loadInfo() {
    try { const r = await fetch('/api/kroma/info'); setInfo(await r.json()); } catch {}
  }

  function resetBox() { setPhase(0); setBox(null); setValue(''); setMsg(null); }

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      if (phase === 0) {
        const res = await fetch('/api/kroma/match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'lookup', value, operator }),
        });
        const j = await res.json();
        if (j.ok) {
          beepOK();
          setBox(j.box); setDone(null);
          setPhase(1); setValue(''); setMsg(null);
          if (j.alreadyMatched) setMsg({ ok: true, text: '⚠️ Esta caja YA estaba MATCHED. Puedes re-verificar.' });
        } else { siren(); setMsg({ ok: false, text: j.message }); setValue(''); }
      } else if (phase === 1 && box) {
        const res = await fetch('/api/kroma/match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verifyCpu', boxId: box.id, value, operator }),
        });
        const j = await res.json();
        if (j.ok) { beepOK(); setPhase(2); setValue(''); setMsg(null); }
        else { siren(); setMsg({ ok: false, text: j.message, expected: j.expected }); setValue(''); }
      } else if (phase === 2 && box) {
        const res = await fetch('/api/kroma/match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verifyMonitor', boxId: box.id, value, operator }),
        });
        const j = await res.json();
        if (j.ok) {
          beepOK();
          setDone(j.box);
          setHistory((h) => [{ ok: true, caja: j.box.cajaLabel, usdomCpu: j.box.usdomCpu, stCpu: j.box.stCpu, stMonitor: j.box.stMonitor, at: new Date() }, ...h].slice(0, 12));
          resetBox();
          loadInfo();
        } else { siren(); setMsg({ ok: false, text: j.message, expected: j.expected }); setValue(''); }
      }
    } catch (e: any) {
      siren(); setMsg({ ok: false, text: e?.message ?? 'Error' });
    } finally { setBusy(false); }
  }

  const phaseCfg = [
    { label: '① Escanea ST CPU de la CAJA (afuera)', color: 'border-sky-500', hint: 'La etiqueta grande de la caja master.' },
    { label: '② Escanea ST del CPU (adentro)', color: 'border-amber-500', hint: 'Saca el CPU y escanea su Service Tag.' },
    { label: '③ Escanea ST del MONITOR (adentro)', color: 'border-fuchsia-500', hint: 'Escanea el Service Tag del monitor.' },
  ][phase];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black text-white">📦 Match KROMA — 3 escaneos</h1>
          <p className="text-slate-400 text-sm">Caja master = CPU + Monitor. Escanea ST CPU (caja) → ST CPU (adentro) → ST Monitor (adentro).</p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-400">Operador:</span>
          <input value={operator} onChange={(e) => { setOperator(e.target.value); op.set(e.target.value); }}
            placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40" />
        </label>
      </div>

      {/* Progreso */}
      {info && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex gap-6 flex-wrap text-sm mb-3">
            <div><span className="text-slate-400">Total cajas:</span> <b className="text-white text-lg">{info.total}</b></div>
            <div><span className="text-slate-400">Matched:</span> <b className="text-emerald-400 text-lg">{info.matched}</b></div>
            <div><span className="text-slate-400">Pendientes:</span> <b className="text-amber-400 text-lg">{info.pendientes}</b></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {info.ordenes.map((o) => {
              const pct = o.total ? Math.round((o.matched / o.total) * 100) : 0;
              const full = o.matched >= o.total;
              return (
                <div key={o.usdomCpu} className={`rounded p-2 text-xs border ${full ? 'border-emerald-600 bg-emerald-950/40' : 'border-slate-700 bg-slate-950'}`}>
                  <div className="font-mono text-slate-300">CPU {o.usdomCpu}</div>
                  <div className="font-mono text-slate-500">Mon {o.usdomMonitor}</div>
                  <div className={`mt-1 font-black ${full ? 'text-emerald-400' : 'text-white'}`}>{o.matched}/{o.total} <span className="opacity-60">({pct}%)</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!scanning ? (
          <button onClick={() => setScanning(true)}
            className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-6 py-4 text-white text-xl font-black shadow-lg">▶ Start Scan</button>
        ) : (
          <button onClick={() => { setScanning(false); resetBox(); }}
            className="flex-1 rounded-lg bg-red-700 hover:bg-red-600 px-6 py-4 text-white text-xl font-black">■ Stop Scan</button>
        )}
        {box && scanning && (
          <button onClick={resetBox} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-4 text-white font-bold">↺ Reiniciar caja</button>
        )}
      </div>

      {/* Tarjeta de caja identificada */}
      {box && (
        <div className="rounded-lg bg-slate-900 border-2 border-sky-600 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><div className="text-xs uppercase text-slate-500">Caja</div><div className="text-xl font-black text-white">{box.cajaLabel ?? '-'}</div></div>
          <div><div className="text-xs uppercase text-slate-500">Orden CPU</div><div className="text-lg font-mono text-sky-300">{box.usdomCpu}</div></div>
          <div><div className="text-xs uppercase text-slate-500">Orden Monitor</div><div className="text-lg font-mono text-fuchsia-300">{box.usdomMonitor}</div></div>
          <div><div className="text-xs uppercase text-slate-500">Progreso</div>
            <div className="text-sm font-bold">
              <span className={phase > 0 ? 'text-emerald-400' : 'text-slate-500'}>CPU caja ✓</span>{' · '}
              <span className={phase > 1 ? 'text-emerald-400' : 'text-slate-500'}>CPU dentro {phase > 1 ? '✓' : '…'}</span>{' · '}
              <span className="text-slate-500">Monitor …</span>
            </div>
          </div>
        </div>
      )}

      {/* Input de escaneo */}
      {scanning && (
        <div className={`rounded-lg bg-slate-900 border-2 ${phaseCfg.color} p-5`}>
          <label className="block text-xl text-white font-bold mb-1">{phaseCfg.label}</label>
          <p className="text-slate-400 text-sm mb-3">{phaseCfg.hint}</p>
          <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
            placeholder="Service Tag…" borderColor={phaseCfg.color} armed={true} />
        </div>
      )}

      {/* Mensaje de error / aviso */}
      {msg && (
        <div className={`rounded-lg p-5 ${msg.ok ? 'bg-amber-600' : 'bg-red-700'} text-white`}>
          <div className="text-2xl font-black">{msg.ok ? '⚠️' : '❌'} {msg.text}</div>
          {msg.expected && <div className="mt-2 text-lg">Esperado: <b className="font-mono text-2xl">{msg.expected}</b></div>}
        </div>
      )}

      {/* Éxito */}
      {done && (
        <div className="rounded-lg bg-emerald-600 text-white p-6">
          <div className="text-3xl font-black">✅ CAJA COMPLETA — MATCHED</div>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><div className="text-xs uppercase opacity-80">Caja</div><div className="text-xl font-black">{done.cajaLabel ?? '-'}</div></div>
            <div><div className="text-xs uppercase opacity-80">Orden CPU</div><div className="font-mono text-lg">{done.usdomCpu}</div></div>
            <div><div className="text-xs uppercase opacity-80">ST CPU</div><div className="font-mono text-lg">{done.stCpu}</div></div>
            <div><div className="text-xs uppercase opacity-80">ST Monitor</div><div className="font-mono text-lg">{done.stMonitor}</div></div>
          </div>
        </div>
      )}

      {/* Historial */}
      {history.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 mb-2">Últimas cajas</div>
          <ul className="space-y-1 text-sm font-mono">
            {history.map((h, i) => (
              <li key={i} className="text-emerald-400">✓ Caja {h.caja ?? '?'} · CPU {h.stCpu} + Mon {h.stMonitor} · orden {h.usdomCpu}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
