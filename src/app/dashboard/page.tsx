'use client';

import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [s, setS] = useState<any>(null);
  async function load() {
    const res = await fetch('/api/stats', { cache: 'no-store' });
    setS(await res.json());
  }
  useEffect(() => { load(); const iv = setInterval(load, 3000); return ()=>clearInterval(iv); }, []);
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
            onClick={async () => {
              if (!confirm('¿Reiniciar TODO el proceso? Esto pone todos los equipos en PENDING y borra el historial de eventos. No borra el catálogo importado ni los rollos.')) return;
              const res = await fetch('/api/reset', { method: 'POST' });
              if (res.ok) { alert('Proceso reiniciado'); load(); }
              else alert('Error al reiniciar');
            }}
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
          <span>{s.progressPct}%</span>
        </div>
        <div className="h-4 bg-slate-800 rounded overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${s.progressPct}%` }}/>
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

      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="text-sm text-slate-400 mb-3">Últimos eventos</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-800">
              <tr>
                <th className="py-2">Hora</th><th>Paso</th><th>Asset</th><th>Inventario</th>
                <th>Caja</th><th>Cuadr.</th><th>Op.</th><th>Result</th><th>Msg</th>
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
                  <td>{e.boardCell ?? '-'}</td>
                  <td>{e.operator ?? '-'}</td>
                  <td className={e.result === 'OK' ? 'text-emerald-400' : 'text-red-400'}>{e.result}</td>
                  <td className="text-slate-500 truncate max-w-xs">{e.message ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
