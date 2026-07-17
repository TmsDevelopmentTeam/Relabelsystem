'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

type Step = 'small' | 'asset' | 'big' | 'result';

export default function Paso4Page() {
  const op = useOperator();
  const [operator, setOperator] = useState('');
  const [step, setStep] = useState<Step>('small');
  const [small, setSmall] = useState('');
  const [asset, setAsset] = useState('');
  const [big, setBig] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => { setOperator(op.get()); }, []);

  function reset() {
    setStep('small'); setSmall(''); setAsset(''); setBig(''); setValue(''); setResult(null);
  }

  async function submit() {
    const v = value.trim();
    if (!v || busy) return;

    if (step === 'small')  { setSmall(v); setValue(''); setStep('asset'); return; }
    if (step === 'asset')  { setAsset(v); setValue(''); setStep('big');   return; }
    if (step === 'big') {
      setBig(v);
      setBusy(true);
      try {
        const res = await fetch('/api/paso4-match', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ smallLabel: small, assetTag: asset, bigLabel: v, operator }),
        });
        const json = await res.json();
        setResult(json);
        setStep('result');
        if (json.ok) beepOK(); else siren();
      } catch(e:any) {
        setResult({ ok:false, message: e?.message });
        setStep('result');
        siren();
      } finally {
        setBusy(false); setValue('');
      }
    }
  }

  const labels: Record<Step,string> = {
    small: '1/3 · Escanea la etiqueta PEQUEÑA (activo fijo pegada al equipo)',
    asset: '2/3 · Escanea el ASSET TAG del equipo (SN físico Dell)',
    big:   '3/3 · Escanea la etiqueta GRANDE (pegada a la caja)',
    result: 'Resultado',
  };
  const stepColor: Record<Step,string> = {
    small: 'border-sky-500', asset: 'border-purple-500', big: 'border-amber-500', result: 'border-slate-700',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black text-white">④ MATCH · Verificación triple</h1>
          <p className="text-slate-400 text-sm">Escanea los 3 en cualquier orden fijo: etiqueta pequeña → Asset Tag → etiqueta grande.</p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-400">Operador:</span>
          <input value={operator} onChange={(e)=>{setOperator(e.target.value); op.set(e.target.value);}}
            placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40"/>
        </label>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Chip active={step==='small'} done={!!small}>Pequeña {small && `· ${small}`}</Chip>
        <Chip active={step==='asset'} done={!!asset}>Asset Tag {asset && `· ${asset}`}</Chip>
        <Chip active={step==='big'} done={!!big}>Grande {big && `· ${big}`}</Chip>
      </div>

      {step !== 'result' && (
        <div className={`rounded-lg border-2 ${stepColor[step]} bg-slate-900 p-5`}>
          <label className="block text-lg text-slate-200 mb-3">{labels[step]}</label>
          <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
            placeholder="Escanea…" borderColor={stepColor[step]}/>
        </div>
      )}

      {step === 'result' && result?.ok && <SuccessBanner result={result} onReset={reset}/>}
      {step === 'result' && result && !result.ok && (
        <ErrorOverlay result={result} scanned={{small, asset, big}} onReset={reset}/>
      )}
    </div>
  );
}

function Chip({ active, done, children }: { active:boolean; done:boolean; children:React.ReactNode }) {
  const cls = done
    ? 'bg-emerald-800/40 border-emerald-500 text-emerald-100'
    : active
      ? 'bg-sky-800/40 border-sky-500 text-sky-100'
      : 'bg-slate-800/40 border-slate-700 text-slate-400';
  return <div className={`px-3 py-2 rounded border text-sm font-mono ${cls}`}>{children}</div>;
}

function SuccessBanner({ result, onReset }: { result:any; onReset:()=>void }) {
  const [c,setC] = useState(3);
  useEffect(() => {
    const iv = setInterval(() => setC((x) => Math.max(x - 1, 0)), 1000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (c === 0) onReset();
  }, [c, onReset]);
  return (
    <div className="rounded-lg bg-emerald-600 p-8 text-white">
      <div className="text-5xl font-black">✅ MATCH CORRECTO</div>
      <div className="text-lg opacity-90 mt-2">
        {result.alreadyMatched ? 'Ya estaba verificado' : 'Caja lista para enviar'}
      </div>
      <div className="mt-4 text-sm opacity-70">Siguiente en {c}…</div>
      <button onClick={onReset} className="mt-3 rounded bg-white/20 hover:bg-white/30 px-4 py-2 text-white text-sm">
        Siguiente ahora
      </button>
    </div>
  );
}

function ErrorOverlay({ result, scanned, onReset }: any) {
  const [enabledIn, setEnabledIn] = useState(3);
  const [flash, setFlash] = useState(true);
  useEffect(() => { const iv = setInterval(() => setEnabledIn(n=>n>0?n-1:0), 1000); return ()=>clearInterval(iv); }, []);
  useEffect(() => { const iv = setInterval(() => setFlash(f=>!f), 500); return ()=>clearInterval(iv); }, []);
  useEffect(() => {
    const iv = setInterval(() => siren(), 4000);
    return () => clearInterval(iv);
  }, []);
  const isMismatch = result.reason === 'MISMATCH';
  const exp = result.expected?.inventario;
  const detail = result.detail ?? {};

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors duration-200 ${flash ? 'bg-red-600' : 'bg-red-800'}`}>
      <div className="max-w-3xl w-full bg-black/40 border-4 border-white rounded-2xl p-8 text-white shadow-2xl">
        <div className="flex items-start gap-4 mb-6">
          <div className="text-7xl">🚨</div>
          <div>
            <div className="text-5xl font-black uppercase">{isMismatch ? 'NO COINCIDE' : (result.reason ?? 'ERROR')}</div>
            <div className="text-xl mt-2 font-semibold">
              {isMismatch ? 'Las etiquetas NO corresponden al equipo. NO envíes esta caja.' : result.message}
            </div>
          </div>
        </div>

        {isMismatch && exp && (
          <div className="grid gap-3 mb-6">
            <div className="rounded-xl bg-emerald-900/50 border-2 border-emerald-400 p-4">
              <div className="text-xs uppercase text-emerald-200 mb-1">Inventario esperado (para Asset Tag {result.expected?.assetTag})</div>
              <div className="font-mono text-3xl font-bold text-emerald-100">{exp}</div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className={`rounded-xl border-2 p-3 ${detail.smallOk ? 'border-emerald-400 bg-emerald-950/50' : 'border-red-300 bg-red-950/70'}`}>
                <div className="text-xs uppercase mb-1">Etiqueta pequeña {detail.smallOk ? '✓' : '✗'}</div>
                <div className="font-mono text-xl break-all">{scanned.small}</div>
              </div>
              <div className={`rounded-xl border-2 p-3 ${detail.bigOk ? 'border-emerald-400 bg-emerald-950/50' : 'border-red-300 bg-red-950/70'}`}>
                <div className="text-xs uppercase mb-1">Etiqueta grande {detail.bigOk ? '✓' : '✗'}</div>
                <div className="font-mono text-xl break-all">{scanned.big}</div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-black/40 p-3 mb-6 text-sm font-mono">
          Asset Tag escaneado: <b>{scanned.asset}</b>
        </div>

        <div className="rounded-lg bg-yellow-500 text-black p-4 mb-6 font-bold">
          ⚠️ Detente. Consulta al supervisor. NO envíes esta caja hasta corregir.
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm opacity-80">
            {enabledIn > 0 ? `Lee bien. Botón habilitado en ${enabledIn}…` : 'Presiona ENTENDÍ para reintentar.'}
          </div>
          <button onClick={onReset} disabled={enabledIn > 0}
            className={`rounded-xl px-8 py-4 text-xl font-black uppercase ${enabledIn > 0 ? 'bg-white/20 text-white/40 cursor-not-allowed' : 'bg-white text-red-700 hover:bg-yellow-200 shadow-lg'}`}>
            {enabledIn > 0 ? `Espera ${enabledIn}` : 'Entendí, reintentar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function siren() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'square'; o.frequency.value = i % 2 === 0 ? 300 : 180;
      const t = now + i * 0.25;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t); o.stop(t + 0.23);
    }
  } catch {}
}
