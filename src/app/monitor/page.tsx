'use client';

import { useEffect, useRef, useState } from 'react';

type Cama = { assetTag: string; inventario: string; producto: string | null; partida: string | null; pallet: string | null; cama: string | null; position: string | null; scannedAt: string; scannedBy: string | null; ordenDell: string | null };
type Match = { assetTag: string | null; inventario: string | null; boxLabel: string | null; operator: string | null; result: string; message: string | null; createdAt: string };
type Data = { camaRecent: Cama[]; matchRecent: Match[]; counts: { camaArmadas: number; camaTotal: number; camaHoy: number; matchHoy: number; matchedTotal: number; eqTotal: number }; nowISO: string };

function hora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
    try {
      const r = await fetch('/api/monitor', { cache: 'no-store' });
      setD(await r.json());
      setErr(false);
    } catch { setErr(true); }
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
        <h1 className="text-3xl font-black text-white">👁️ Monitor <span className="text-slate-400 text-lg font-normal">(supervisor · solo lectura)</span></h1>
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${err ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
          {err ? 'sin conexión' : 'en vivo · cada 3s'}{d ? ` · ${hora(d.nowISO)}` : ''}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-orange-800/50 p-4 text-white">
          <div className="text-xs opacity-80 uppercase">🛏️ Cama · armadas</div>
          <div className="text-3xl font-black mt-1">{c ? c.camaArmadas : '—'}<span className="text-lg opacity-60"> / {c?.camaTotal ?? '—'}</span></div>
          <div className="text-[11px] opacity-70">{c ? pct(c.camaArmadas, c.camaTotal) : 0}%</div>
        </div>
        <div className="rounded-lg bg-orange-700/50 p-4 text-white">
          <div className="text-xs opacity-80 uppercase">🛏️ Cama · hoy</div>
          <div className="text-3xl font-black mt-1">{c ? c.camaHoy : '—'}</div>
          <div className="text-[11px] opacity-70">escaneadas hoy</div>
        </div>
        <div className="rounded-lg bg-emerald-800/50 p-4 text-white">
          <div className="text-xs opacity-80 uppercase">✅ Match · total</div>
          <div className="text-3xl font-black mt-1">{c ? c.matchedTotal : '—'}<span className="text-lg opacity-60"> / {c?.eqTotal ?? '—'}</span></div>
          <div className="text-[11px] opacity-70">{c ? pct(c.matchedTotal, c.eqTotal) : 0}%</div>
        </div>
        <div className="rounded-lg bg-emerald-700/50 p-4 text-white">
          <div className="text-xs opacity-80 uppercase">✅ Match · hoy</div>
          <div className="text-3xl font-black mt-1">{c ? c.matchHoy : '—'}</div>
          <div className="text-[11px] opacity-70">eventos de match hoy</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* CAMA feed */}
        <div className="rounded-lg border border-orange-700/50 bg-slate-900">
          <div className="px-4 py-2 border-b border-slate-700 font-bold text-orange-300">🛏️ Cama — últimas ubicaciones escaneadas</div>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-xs sticky top-0 bg-slate-900">
                <tr><th className="text-left px-3 py-1">Hora</th><th className="text-left px-3 py-1">Serie</th><th className="text-left px-3 py-1">Ubicación</th><th className="text-left px-3 py-1">Operador</th></tr>
              </thead>
              <tbody>
                {d?.camaRecent.map((r, i) => (
                  <tr key={`${r.assetTag}-${i}`} className={`border-t border-slate-800 ${i === 0 ? 'bg-orange-500/10' : ''}`}>
                    <td className="px-3 py-1 text-slate-400 whitespace-nowrap" title={r.scannedAt}>{hace(r.scannedAt, now)}</td>
                    <td className="px-3 py-1 font-mono text-white">{r.assetTag}<div className="text-[10px] text-slate-500">{r.inventario}</div></td>
                    <td className="px-3 py-1 text-slate-200">P<b>{r.pallet}</b> · C<b>{r.cama}</b> · #<b className="text-orange-300">{r.position}</b><div className="text-[10px] text-slate-500">{r.partida}</div></td>
                    <td className="px-3 py-1 text-slate-300">{r.scannedBy || '—'}</td>
                  </tr>
                ))}
                {d && d.camaRecent.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Sin ubicaciones aún</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* MATCH feed */}
        <div className="rounded-lg border border-emerald-700/50 bg-slate-900">
          <div className="px-4 py-2 border-b border-slate-700 font-bold text-emerald-300">✅ Match — últimas verificaciones</div>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-xs sticky top-0 bg-slate-900">
                <tr><th className="text-left px-3 py-1">Hora</th><th className="text-left px-3 py-1">Serie / Inv</th><th className="text-left px-3 py-1">Resultado</th><th className="text-left px-3 py-1">Operador</th></tr>
              </thead>
              <tbody>
                {d?.matchRecent.map((r, i) => {
                  const ok = r.result === 'OK';
                  const color = ok ? 'text-emerald-400' : r.result === 'DUPLICATE' ? 'text-yellow-400' : 'text-red-400';
                  return (
                    <tr key={i} className={`border-t border-slate-800 ${i === 0 ? 'bg-emerald-500/10' : ''}`}>
                      <td className="px-3 py-1 text-slate-400 whitespace-nowrap" title={r.createdAt}>{hace(r.createdAt, now)}</td>
                      <td className="px-3 py-1 font-mono text-white">{r.assetTag || '—'}<div className="text-[10px] text-slate-500">{r.inventario}</div></td>
                      <td className={`px-3 py-1 font-bold ${color}`}>{ok ? '✓ OK' : `✗ ${r.result}`}{r.message && !ok && <div className="text-[10px] text-slate-500 font-normal">{r.message}</div>}</td>
                      <td className="px-3 py-1 text-slate-300">{r.operator || '—'}</td>
                    </tr>
                  );
                })}
                {d && d.matchRecent.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Sin matches aún</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
