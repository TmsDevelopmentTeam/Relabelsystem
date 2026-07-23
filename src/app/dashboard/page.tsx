'use client';

import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [s, setS] = useState<any>(null);
  const [daily, setDaily] = useState<any>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(5);

  async function load() {
    const [res, resDaily] = await Promise.all([
      fetch('/api/stats', { cache: 'no-store' }),
      fetch('/api/stats/daily', { cache: 'no-store' }),
    ]);
    setS(await res.json());
    setDaily(await resDaily.json());
  }
  useEffect(() => { load(); const iv = setInterval(load, 3000); return ()=>clearInterval(iv); }, []);

  // Countdown al abrir modal reset
  useEffect(() => {
    if (!resetOpen) { setResetCountdown(5); setResetInput(''); return; }
    const iv = setInterval(() => setResetCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(iv);
  }, [resetOpen]);

  async function doReset() {
    setResetBusy(true);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) { setResetOpen(false); load(); alert('✓ Proceso reiniciado'); }
      else alert('Error al reiniciar');
    } finally { setResetBusy(false); }
  }

  if (!s) return <div>Cargando…</div>;

  const kpis = [
    { label: 'Total',       value: s.total,     color: 'bg-slate-800' },
    { label: 'Pendientes',  value: s.pending,   color: 'bg-slate-700' },
    { label: '① Ubicados',  value: s.paired,    color: 'bg-amber-800' },
    { label: '② Etiquetados', value: s.labeled, color: 'bg-purple-800' },
    { label: '③ Matched',   value: s.matched,   color: 'bg-emerald-700' },
    { label: '🎞️ Rollos',    value: s.rollTotal, color: 'bg-teal-800' },
  ];

  const typeInfo: Record<string,{emoji:string;name:string;color:string}> = {
    LAPTOP: {emoji:'💻',name:'Laptop',color:'bg-yellow-600'},
    MONITOR:{emoji:'📺',name:'Monitor',color:'bg-purple-600'},
    DESKTOP:{emoji:'🖥️',name:'CPU',color:'bg-blue-600'},
    OTHER:  {emoji:'❓',name:'Otro',color:'bg-slate-600'},
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-black text-white">📊 Dashboard</h1>
        <div className="flex gap-2 items-center">
          <a href="/api/export" className="rounded bg-sky-600 hover:bg-sky-500 px-4 py-2 text-white text-sm font-bold">
            ⬇ Export Excel
          </a>
          <button
            onClick={() => setResetOpen(true)}
            className="rounded bg-red-800 hover:bg-red-700 px-4 py-2 text-white text-sm font-bold"
          >
            ↻ Reiniciar proceso
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-lg p-4 ${k.color}`}>
            <div className="text-xs uppercase text-white/70">{k.label}</div>
            <div className="text-3xl font-black text-white mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex justify-between text-sm text-slate-400 mb-2">
          <span>Progreso (Matched / Total)</span>
          <span>
            {s.matched}/{s.total} ·{' '}
            {s.progressPctExact < 1 && s.matched > 0
              ? s.progressPctExact.toFixed(2)
              : s.progressPct}%
          </span>
        </div>
        <div className="h-4 bg-slate-800 rounded overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all"
            style={{ width: s.matched > 0 ? `max(2px, ${s.progressPctExact}%)` : '0%' }}/>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(s.byType).map(([type, agg]: any) => {
          const info = typeInfo[type] ?? typeInfo.OTHER;
          const pct = agg.total ? Math.round((agg.matched / agg.total) * 100) : 0;
          return (
            <div key={type} className={`rounded-lg p-4 border border-white/10 bg-slate-900`}>
              <div className="flex justify-between items-center mb-2">
                <div className="text-white font-bold text-lg">{info.emoji} {info.name}</div>
                <div className="text-slate-400 text-sm">{agg.total}</div>
              </div>
              <div className="text-xs text-slate-400 grid grid-cols-2 gap-1">
                <div>Pending: <b className="text-white">{agg.pending}</b></div>
                <div>Ubicados: <b className="text-amber-300">{agg.paired}</b></div>
                <div>Etiquetados: <b className="text-purple-300">{agg.labeled}</b></div>
                <div>Matched: <b className="text-emerald-300">{agg.matched}</b></div>
              </div>
              <div className="mt-2 h-2 bg-black/40 rounded overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }}/>
              </div>
              <div className="text-xs text-slate-400 mt-1">{pct}%</div>
            </div>
          );
        })}
      </div>

      {/* Procesadas por día */}
      {daily && daily.days.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm text-slate-400">📅 Procesadas por día · {daily.totalDays} día(s) con actividad</div>
            <div className="text-xs text-slate-500">Solo cuenta equipos MATCHED</div>
          </div>
          <div className="space-y-2">
            {daily.days.map((d: any) => {
              const pct = Math.round((d.total / daily.max) * 100);
              const fecha = new Date(d.date + 'T12:00:00');
              const dow = fecha.toLocaleDateString('es-MX', { weekday: 'short' });
              return (
                <div key={d.date} className="grid grid-cols-[9rem_1fr_5rem] gap-3 items-center text-sm">
                  <div className="font-mono text-slate-300">
                    <span className="text-slate-500">{dow}</span> {d.date}
                  </div>
                  <div className="h-6 bg-slate-950 rounded overflow-hidden flex items-center relative">
                    <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
                      style={{ width: `${pct}%` }}/>
                    <div className="absolute left-2 text-xs font-mono text-white/90 flex gap-2">
                      {d.byType.LAPTOP > 0 && <span>💻 {d.byType.LAPTOP}</span>}
                      {d.byType.MONITOR > 0 && <span>📺 {d.byType.MONITOR}</span>}
                      {d.byType.DESKTOP > 0 && <span>🖥 {d.byType.DESKTOP}</span>}
                      {d.byType.OTHER > 0 && <span>❓ {d.byType.OTHER}</span>}
                    </div>
                  </div>
                  <div className="text-right font-bold text-emerald-300 font-mono">{d.total}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-400">
            <span>Total histórico:</span>
            <span className="font-mono font-bold text-emerald-300">
              {daily.days.reduce((a: number, d: any) => a + d.total, 0)} equipos
            </span>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="text-sm text-slate-400 mb-3">Últimos eventos</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-800">
              <tr>
                <th className="py-2">Hora</th><th>Paso</th><th>Asset</th><th>Inventario</th>
                <th>Caja</th><th>Result</th><th>Msg</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {s.recent.map((e:any) => (
                <tr key={e.id} className="border-b border-slate-800/60">
                  <td className="py-1 text-slate-400">{new Date(e.createdAt).toLocaleTimeString()}</td>
                  <td className="text-slate-300">{e.step}</td>
                  <td>{e.assetTag ?? '-'}</td>
                  <td>{e.inventario ?? '-'}</td>
                  <td>{e.boxLabel ?? '-'}</td>
                  <td className={e.result === 'OK' ? 'text-emerald-400' : 'text-red-400'}>{e.result}</td>
                  <td className="text-slate-500 truncate max-w-xs">{e.message ?? ''}</td>
                </tr>
              ))}
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
                <div className="text-2xl font-black text-red-400">REINICIAR TODO EL PROCESO</div>
                <div className="text-sm text-slate-300 mt-1">Esta acción NO se puede deshacer.</div>
              </div>
            </div>

            <div className="rounded bg-slate-800 p-3 text-sm text-slate-300 space-y-1">
              <div>Se van a:</div>
              <ul className="list-disc pl-5 text-red-300">
                <li><b>{s.paired + s.labeled + s.matched}</b> equipos vuelven a PENDING</li>
                <li>Borrar TODO el historial de eventos ({s.recent?.length ? 'incluye ' + s.recent.length + ' recientes' : ''})</li>
              </ul>
              <div className="text-emerald-400 mt-2">NO se borra:</div>
              <ul className="list-disc pl-5 text-emerald-300">
                <li>Catálogo importado ({s.total} equipos)</li>
                <li>Rollos escaneados ({s.rollTotal})</li>
                <li>Ubicaciones (Cama/Position/Pallet)</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-2">
                Para confirmar, escribe <b className="text-red-400 font-mono">REINICIAR</b> abajo:
              </label>
              <input
                value={resetInput}
                onChange={(e) => setResetInput(e.target.value)}
                placeholder="REINICIAR"
                autoFocus
                className="w-full rounded bg-slate-950 border-2 border-slate-700 px-3 py-3 text-xl font-mono text-white focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setResetOpen(false)}
                disabled={resetBusy}
                className="rounded bg-slate-700 hover:bg-slate-600 px-4 py-2 text-white font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={doReset}
                disabled={resetBusy || resetInput.trim().toUpperCase() !== 'REINICIAR' || resetCountdown > 0}
                className="rounded bg-red-700 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed px-4 py-2 text-white font-bold"
              >
                {resetBusy
                  ? 'Reiniciando…'
                  : resetCountdown > 0
                    ? `Espera ${resetCountdown}s`
                    : '⚠ SÍ, REINICIAR TODO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
