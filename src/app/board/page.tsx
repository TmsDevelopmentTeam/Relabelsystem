'use client';

import { useEffect, useState } from 'react';

type Cell = { cell: string; occupied: boolean; equipment: any };

export default function BoardPage() {
  const [data, setData] = useState<any>(null);

  async function load() {
    const res = await fetch('/api/board', { cache: 'no-store' });
    setData(await res.json());
  }
  useEffect(() => { load(); const iv = setInterval(load, 2500); return () => clearInterval(iv); }, []);

  if (!data) return <div>Cargando…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-black text-white">🗂 Tablero</h1>
        <div className="text-sm text-slate-400">
          {data.occupiedCount} ocupadas · {data.freeCount} libres · {data.cols}×{data.rows}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-10"></th>
              {Array.from({length: data.cols}).map((_,c) => (
                <th key={c} className="text-slate-400 text-sm font-bold text-center py-1">
                  {String.fromCharCode(65 + c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row: Cell[], rIdx: number) => (
              <tr key={rIdx}>
                <td className="text-slate-400 text-sm font-bold text-center pr-1">{rIdx + 1}</td>
                {row.map((c) => (
                  <td key={c.cell} className="p-1 align-top">
                    <div className={`min-h-[70px] rounded border p-1.5 text-xs ${
                      c.occupied
                        ? statusColor(c.equipment?.status)
                        : 'border-slate-800 bg-slate-950/50'
                    }`}>
                      <div className="font-mono text-slate-400 text-[10px]">{c.cell}</div>
                      {c.equipment ? (
                        <div className="mt-0.5">
                          <div className="font-mono text-white text-xs truncate" title={c.equipment.assetTag}>
                            {c.equipment.assetTag}
                          </div>
                          <div className="font-mono text-amber-300 text-[10px] truncate" title={c.equipment.inventario}>
                            {c.equipment.inventario}
                          </div>
                          <div className="text-[10px] mt-0.5">{statusEmoji(c.equipment.status)}</div>
                        </div>
                      ) : (
                        <div className="text-center text-slate-600 text-xs mt-3">libre</div>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Legend color="bg-sky-800/50 border-sky-500" label="① Tagged" />
        <Legend color="bg-amber-800/50 border-amber-500" label="② Paired" />
        <Legend color="bg-purple-800/50 border-purple-500" label="③ Labeled (libre)" />
        <Legend color="bg-emerald-800/50 border-emerald-500" label="④ Matched" />
      </div>
    </div>
  );
}

function statusColor(s?: string) {
  switch (s) {
    case 'TAG_PLACED':  return 'border-sky-500 bg-sky-800/40';
    case 'PAIR_READY':  return 'border-amber-500 bg-amber-800/40';
    case 'LABELED':     return 'border-purple-500 bg-purple-800/40';
    case 'MATCHED':     return 'border-emerald-500 bg-emerald-800/40';
    default:            return 'border-slate-600 bg-slate-800/40';
  }
}
function statusEmoji(s?: string) {
  switch (s) {
    case 'TAG_PLACED':  return '① tagged';
    case 'PAIR_READY':  return '② paired';
    case 'LABELED':     return '③ labeled';
    case 'MATCHED':     return '④ matched';
    default: return s;
  }
}
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className={`rounded border px-2 py-1 ${color} text-white`}>{label}</div>
  );
}
