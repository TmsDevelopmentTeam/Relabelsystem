'use client';

import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [s, setS] = useState<any>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(5);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/kroma/stats', { cache: 'no-store' });
    setS(await res.json());
  }
  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv); }, []);

  useEffect(() => {
    if (!resetOpen) { setResetCountdown(5); setResetInput(''); setResetMsg(null); return; }
    const iv = setInterval(() => setResetCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(iv);
  }, [resetOpen]);

  async function doReset() {
    setResetBusy(true);
    try {
      // 1) Backup obligatorio ANTES de tocar la BD
      setResetMsg('Sacando backup…');
      const b = await fetch('/api/admin/backup?motivo=kroma_reset');
      const bj = await b.json();
      if (!bj.ok) { setResetMsg('❌ Falló el backup, no reinicio.'); setResetBusy(false); return; }
      // 2) Reset
      setResetMsg(`Backup ${bj.backup} OK. Reiniciando…`);
      const res = await fetch('/api/kroma/reset', { method: 'POST' });
      const rj = await res.json();
      if (rj.ok) { setResetOpen(false); load(); alert(`✓ ${rj.reset} cajas reiniciadas a PENDING (backup: ${bj.backup})`); }
      else setResetMsg('❌ Error al reiniciar');
    } finally { setResetBusy(false); }
  }

  if (!s) return <div>Cargando…</div>;
  if (s.error) return <div className="text-red-400">Error: {s.error}</div>;

  const rate = s.rate ?? {};
  const kpis = [
    { label: 'Total cajas', value: s.total, color: 'bg-slate-800' },
    { label: 'Matched', value: s.matched, color: 'bg-emerald-700' },
    { label: 'Pendientes', value: s.pendientes, color: 'bg-amber-800' },
    { label: 'Órdenes', value: s.ordenes?.length ?? 0, color: 'bg-sky-800' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black text-white">📊 Dashboard KROMA</h1>
          <p className="text-slate-400 text-sm">Overpacking · match de cajas CPU + Monitor</p>
        </div>
        <div className="flex gap-2 items-center">
          <a href="/api/kroma/export" className="rounded bg-sky-600 hover:bg-sky-500 px-4 py-2 text-white text-sm font-bold">⬇ Export Excel</a>
          <button onClick={() => setResetOpen(true)} className="rounded bg-red-800 hover:bg-red-700 px-4 py-2 text-white text-sm font-bold">↻ Reiniciar match</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-lg p-4 ${k.color}`}>
            <div className="text-xs uppercase text-white/70">{k.label}</div>
            <div className="text-3xl font-black text-white mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Barra de progreso global */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex justify-between text-sm text-slate-400 mb-2">
          <span>Progreso (Matched / Total)</span>
          <span>{s.matched}/{s.total} · {s.progressPct}%</span>
        </div>
        <div className="h-4 bg-slate-800 rounded overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: s.matched > 0 ? `max(2px, ${s.progressPctExact}%)` : '0%' }} />
        </div>
      </div>

      {/* Progreso por orden */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {s.ordenes?.map((o: any) => {
          const pct = o.total ? Math.round((o.matched / o.total) * 100) : 0;
          const full = o.matched >= o.total;
          return (
            <div key={o.usdomCpu} className={`rounded-lg p-4 border ${full ? 'border-emerald-600 bg-emerald-950/40' : 'border-slate-700 bg-slate-900'}`}>
              <div className="text-xs text-slate-500">Orden CPU</div>
              <div className="font-mono text-white font-bold">{o.usdomCpu}</div>
              <div className="text-xs text-slate-500 mt-1">Monitor</div>
              <div className="font-mono text-fuchsia-300 text-sm">{o.usdomMonitor}</div>
              <div className={`mt-2 text-2xl font-black ${full ? 'text-emerald-400' : 'text-white'}`}>{o.matched}/{o.total}</div>
              <div className="mt-1 h-2 bg-black/40 rounded overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-slate-400 mt-1">{pct}%</div>
            </div>
          );
        })}
      </div>

      {/* Velocidad */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="text-sm text-slate-400">⚡ Velocidad (cajas MATCHED)</div>
          <div className="text-xs text-slate-500">actualiza cada 3s</div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
          <div className="rounded-lg bg-emerald-800/60 p-3 text-white"><div className="text-xs opacity-80">Último min</div><div className="text-3xl font-black mt-1">{rate.min1 ?? 0}</div></div>
          <div className="rounded-lg bg-emerald-700/60 p-3 text-white"><div className="text-xs opacity-80">10 min</div><div className="text-3xl font-black mt-1">{rate.min10 ?? 0}</div><div className="text-[10px] opacity-70">≈ {rate.ratePerMin ?? 0}/min</div></div>
          <div className="rounded-lg bg-emerald-600/60 p-3 text-white"><div className="text-xs opacity-80">30 min</div><div className="text-3xl font-black mt-1">{rate.min30 ?? 0}</div></div>
          <div className="rounded-lg bg-sky-700/60 p-3 text-white"><div className="text-xs opacity-80">1 hora</div><div className="text-3xl font-black mt-1">{rate.hour1 ?? 0}</div></div>
          <div className="rounded-lg bg-sky-800/60 p-3 text-white"><div className="text-xs opacity-80">6 hrs</div><div className="text-3xl font-black mt-1">{rate.hour6 ?? 0}</div></div>
          <div className="rounded-lg bg-cyan-800/60 p-3 text-white"><div className="text-xs opacity-80">Hoy</div><div className="text-3xl font-black mt-1">{rate.today ?? 0}</div></div>
        </div>

        <div className="text-xs text-slate-400 mb-2">Distribución por hora (hoy · México)</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {s.hourly?.map((h: any) => {
            const heightPct = h.count > 0 ? Math.max(6, (h.count / s.maxHour) * 100) : 0;
            return (
              <div key={h.hour} className="flex flex-col items-center gap-1" title={`${String(h.hour).padStart(2, '0')}:00 · ${h.count} cajas`}>
                <div className="w-full bg-slate-950 rounded-sm relative" style={{ height: '60px' }}>
                  {h.count > 0 && <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-sm" style={{ height: `${heightPct}%` }} />}
                </div>
                <div className="text-[9px] text-slate-500 font-mono">{String(h.hour).padStart(2, '0')}</div>
                <div className="text-[10px] text-emerald-300 font-mono font-bold">{h.count || ''}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Por día */}
      {s.days?.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 mb-3">📅 Cajas por día (MATCHED)</div>
          <div className="space-y-2">
            {s.days.map((d: any) => {
              const pct = Math.round((d.count / s.maxDay) * 100);
              return (
                <div key={d.date} className="grid grid-cols-[8rem_1fr_4rem] gap-3 items-center text-sm">
                  <div className="font-mono text-slate-300">{d.date}</div>
                  <div className="h-6 bg-slate-950 rounded overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-right font-bold text-emerald-300 font-mono">{d.count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Últimas cajas */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="text-sm text-slate-400 mb-3">Últimas cajas matched</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-800">
              <tr><th className="py-2">Caja</th><th>Orden CPU</th><th>ST CPU</th><th>ST Monitor</th><th>Operador</th></tr>
            </thead>
            <tbody className="font-mono text-xs">
              {s.recientes?.map((e: any, i: number) => (
                <tr key={i} className="border-b border-slate-800/60">
                  <td className="py-1 text-slate-300">{e.caja ?? '-'}</td>
                  <td>{e.usdomCpu}</td>
                  <td className="text-sky-300">{e.stCpu}</td>
                  <td className="text-fuchsia-300">{e.stMonitor}</td>
                  <td className="text-slate-400">{e.matchedBy ?? '-'}</td>
                </tr>
              ))}
              {(!s.recientes || s.recientes.length === 0) && (
                <tr><td colSpan={5} className="py-3 text-slate-600">Aún no hay cajas matched.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur">
          <div className="max-w-lg w-full bg-slate-900 border-4 border-red-600 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="text-5xl">⚠️</div>
              <div>
                <div className="text-2xl font-black text-red-400">REINICIAR MATCH KROMA</div>
                <div className="text-sm text-slate-300 mt-1">Todas las cajas vuelven a PENDING. Se hace backup automático antes.</div>
              </div>
            </div>
            <div className="rounded bg-slate-800 p-3 text-sm text-slate-300 space-y-1">
              <div className="text-red-300"><b>{s.matched}</b> cajas matched → PENDING</div>
              <div className="text-emerald-400 mt-1">NO se borra el catálogo ({s.total} cajas).</div>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-2">Escribe <b className="text-red-400 font-mono">REINICIAR</b>:</label>
              <input value={resetInput} onChange={(e) => setResetInput(e.target.value)} placeholder="REINICIAR" autoFocus
                className="w-full rounded bg-slate-950 border-2 border-slate-700 px-3 py-3 text-xl font-mono text-white focus:border-red-500 focus:outline-none" />
            </div>
            {resetMsg && <div className="text-sm text-amber-300 font-mono">{resetMsg}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setResetOpen(false)} disabled={resetBusy} className="rounded bg-slate-700 hover:bg-slate-600 px-4 py-2 text-white font-bold">Cancelar</button>
              <button onClick={doReset} disabled={resetBusy || resetInput.trim().toUpperCase() !== 'REINICIAR' || resetCountdown > 0}
                className="rounded bg-red-700 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed px-4 py-2 text-white font-bold">
                {resetBusy ? 'Procesando…' : resetCountdown > 0 ? `Espera ${resetCountdown}s` : '⚠ SÍ, REINICIAR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
