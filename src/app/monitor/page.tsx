'use client';

import { useEffect, useRef, useState } from 'react';

type Roll = { orderNumber: string | null; value: string; position: number | null; operator: string | null; createdAt: string };
type Matched = { caja: string | null; usdomCpu: string; usdomMonitor: string; stCpu: string; stMonitor: string; matchedAt: string; matchedBy: string | null };
type Alert = { assetTag: string | null; operator: string | null; message: string | null; createdAt: string };
type Orden = { usdomCpu: string; usdomMonitor: string; total: number; matched: number };
type Data = {
  counts: { total: number; matched: number; pendientes: number; matchHoy: number; rollsTotal: number; rollsHoy: number };
  ordenes: Orden[];
  rollsRecent: Roll[];
  matchedRecent: Matched[];
  matchAlerts: Alert[];
  nowISO: string;
};

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function hace(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  return `hace ${Math.floor(m / 60)}h`;
}

export default function MonitorPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<any>(null);

  async function load() {
    try { const r = await fetch('/api/monitor', { cache: 'no-store' }); setD(await r.json()); setErr(false); }
    catch { setErr(true); }
  }
  useEffect(() => {
    load();
    timer.current = setInterval(() => { load(); setNow(Date.now()); }, 3000);
    return () => clearInterval(timer.current);
  }, []);

  const c = d?.counts;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-black text-white">👁️ Monitor KROMA <span className="text-slate-400 text-lg font-normal">(supervisor · solo lectura)</span></h1>
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${err ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
          {err ? 'sin conexión' : 'en vivo · cada 3s'}{d ? ` · ${hora(d.nowISO)}` : ''}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-lg bg-emerald-800/50 p-4 text-white">
          <div className="text-xs opacity-80 uppercase">✅ Cajas matched</div>
          <div className="text-3xl font-black mt-1">{c ? c.matched : '—'}<span className="text-lg opacity-60"> / {c?.total ?? '—'}</span></div>
          <div className="text-[11px] opacity-70">{c ? pct(c.matched, c.total) : 0}%</div>
        </div>
        <div className="rounded-lg bg-emerald-700/50 p-4 text-white">
          <div className="text-xs opacity-80 uppercase">✅ Matched hoy</div>
          <div className="text-3xl font-black mt-1">{c ? c.matchHoy : '—'}</div>
          <div className="text-[11px] opacity-70">cajas hoy</div>
        </div>
        <div className="rounded-lg bg-amber-800/50 p-4 text-white">
          <div className="text-xs opacity-80 uppercase">⏳ Pendientes</div>
          <div className="text-3xl font-black mt-1">{c ? c.pendientes : '—'}</div>
          <div className="text-[11px] opacity-70">cajas por matchear</div>
        </div>
        <div className="rounded-lg bg-cyan-800/50 p-4 text-white">
          <div className="text-xs opacity-80 uppercase">🎞️ Rollos · total</div>
          <div className="text-3xl font-black mt-1">{c ? c.rollsTotal : '—'}</div>
          <div className="text-[11px] opacity-70">etiquetas cargadas</div>
        </div>
        <div className="rounded-lg bg-cyan-700/50 p-4 text-white">
          <div className="text-xs opacity-80 uppercase">🎞️ Rollos · hoy</div>
          <div className="text-3xl font-black mt-1">{c ? c.rollsHoy : '—'}</div>
          <div className="text-[11px] opacity-70">escaneadas hoy</div>
        </div>
      </div>

      {/* Progreso por orden */}
      {d && d.ordenes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {d.ordenes.map((o) => {
            const p = pct(o.matched, o.total);
            const full = o.matched >= o.total;
            return (
              <div key={o.usdomCpu} className={`rounded p-3 border ${full ? 'border-emerald-600 bg-emerald-950/40' : 'border-slate-700 bg-slate-900'}`}>
                <div className="text-xs text-slate-500">CPU <span className="font-mono text-slate-300">{o.usdomCpu}</span></div>
                <div className={`text-xl font-black ${full ? 'text-emerald-400' : 'text-white'}`}>{o.matched}/{o.total} <span className="opacity-60 text-sm">({p}%)</span></div>
                <div className="mt-1 h-1.5 bg-black/40 rounded overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${p}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alertas de mismatch (hoy) */}
      {d && d.matchAlerts.length > 0 && (
        <div className="rounded-lg border border-red-700/60 bg-red-950/30">
          <div className="px-4 py-2 border-b border-red-800/50 font-bold text-red-300">🚨 Mismatches de hoy</div>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {d.matchAlerts.map((a, i) => (
                  <tr key={i} className="border-t border-red-900/40">
                    <td className="px-3 py-1 text-slate-400 whitespace-nowrap">{hace(a.createdAt, now)}</td>
                    <td className="px-3 py-1 font-mono text-white">{a.assetTag || '—'}</td>
                    <td className="px-3 py-1 text-red-300 text-xs">{a.message}</td>
                    <td className="px-3 py-1 text-slate-300">{a.operator || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ROLLOS feed */}
        <div className="rounded-lg border border-cyan-700/50 bg-slate-900">
          <div className="px-4 py-2 border-b border-slate-700 font-bold text-cyan-300">🎞️ Rollos — últimas etiquetas escaneadas</div>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-xs sticky top-0 bg-slate-900">
                <tr><th className="text-left px-3 py-1">Hora</th><th className="text-left px-3 py-1">Etiqueta</th><th className="text-left px-3 py-1">Orden</th><th className="text-left px-3 py-1">Op</th></tr>
              </thead>
              <tbody>
                {d?.rollsRecent.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-800 ${i === 0 ? 'bg-cyan-500/10' : ''}`}>
                    <td className="px-3 py-1 text-slate-400 whitespace-nowrap" title={r.createdAt}>{hace(r.createdAt, now)}</td>
                    <td className="px-3 py-1 font-mono text-white">{r.value}<div className="text-[10px] text-slate-500">#{r.position}</div></td>
                    <td className="px-3 py-1 text-cyan-200 font-mono text-xs">{r.orderNumber}</td>
                    <td className="px-3 py-1 text-slate-300">{r.operator || '—'}</td>
                  </tr>
                ))}
                {d && d.rollsRecent.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Sin rollos aún</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* MATCH feed */}
        <div className="rounded-lg border border-emerald-700/50 bg-slate-900">
          <div className="px-4 py-2 border-b border-slate-700 font-bold text-emerald-300">✅ Cajas matched — últimas</div>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-xs sticky top-0 bg-slate-900">
                <tr><th className="text-left px-3 py-1">Hora</th><th className="text-left px-3 py-1">Caja</th><th className="text-left px-3 py-1">CPU / Monitor</th><th className="text-left px-3 py-1">Op</th></tr>
              </thead>
              <tbody>
                {d?.matchedRecent.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-800 ${i === 0 ? 'bg-emerald-500/10' : ''}`}>
                    <td className="px-3 py-1 text-slate-400 whitespace-nowrap" title={r.matchedAt}>{hace(r.matchedAt, now)}</td>
                    <td className="px-3 py-1 text-white font-bold">{r.caja || '—'}<div className="text-[10px] text-slate-500 font-mono">{r.usdomCpu}</div></td>
                    <td className="px-3 py-1 font-mono text-xs"><span className="text-sky-300">{r.stCpu}</span><div className="text-fuchsia-300">{r.stMonitor}</div></td>
                    <td className="px-3 py-1 text-slate-300">{r.matchedBy || '—'}</td>
                  </tr>
                ))}
                {d && d.matchedRecent.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Sin cajas matched aún</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
