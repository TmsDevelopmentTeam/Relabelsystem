'use client';

import { useEffect, useState } from 'react';
import { ScanInput, beepOK, siren, useOperator } from '@/components/ScanInput';

type Entry = { id: number; value: string; status: string; operator: string | null; createdAt: string };

export default function RollosPage() {
  const op = useOperator();
  const [operator, setOperator] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ items: Entry[]; total: number; available: number; consumed: number } | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);

  useEffect(() => { setOperator(op.get()); load(); }, []);

  async function load() {
    const res = await fetch('/api/rollos?limit=100', { cache: 'no-store' });
    setData(await res.json());
  }

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/rollos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, operator }),
      });
      const json = await res.json();
      if (json.ok) {
        beepOK();
        setLastId(json.entry.id);
        await load();
      } else siren();
      setValue('');
    } catch { siren(); } finally { setBusy(false); }
  }

  async function deleteOne(id: number) {
    if (!confirm(`¿Borrar la entrada #${id}?`)) return;
    await fetch(`/api/rollos?id=${id}`, { method: 'DELETE' });
    load();
  }

  async function deleteAll() {
    if (!confirm('¿BORRAR TODOS los registros de rollos? Esto no se puede deshacer.')) return;
    await fetch('/api/rollos', { method: 'DELETE' });
    setLastId(null);
    load();
  }

  async function renumber() {
    if (!confirm('¿Renumerar los IDs a 1..N (por orden de escaneo)? No se borran valores, solo se renumera.')) return;
    const res = await fetch('/api/rollos/renumber', { method: 'POST' });
    const j = await res.json();
    if (res.ok) { alert(`Renumerado. Total: ${j.total}. IDs ahora: ${j.firstId} → ${j.lastId}`); load(); }
    else alert('Error');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black text-white">🎞️ Rollos de etiquetas</h1>
          <p className="text-slate-400 text-sm">
            Escanea etiquetas del rollo — se guardan en consecutivo automático. Es un buffer de reserva,
            no bloquea el flujo principal (① ② ③ ④). Úsalo si quieren evitar escanear la caja.
          </p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-400">Operador:</span>
          <input value={operator} onChange={(e)=>{setOperator(e.target.value); op.set(e.target.value);}}
            placeholder="Tu nombre" className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm w-40"/>
        </label>
      </div>

      <div className="rounded-lg bg-slate-900 border-2 border-teal-500 p-5">
        <label className="block text-lg text-slate-200 mb-3">Escanea etiqueta del rollo</label>
        <ScanInput value={value} onChange={setValue} onSubmit={submit} disabled={busy}
          placeholder="Etiqueta…" borderColor="border-teal-500"/>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-800 p-4">
            <div className="text-xs uppercase text-white/70">Total escaneadas</div>
            <div className="text-3xl font-black text-white mt-1">{data.total}</div>
          </div>
          <div className="rounded-lg bg-teal-800 p-4">
            <div className="text-xs uppercase text-white/70">Disponibles</div>
            <div className="text-3xl font-black text-white mt-1">{data.available}</div>
          </div>
          <div className="rounded-lg bg-slate-700 p-4">
            <div className="text-xs uppercase text-white/70">Consumidas</div>
            <div className="text-3xl font-black text-white mt-1">{data.consumed}</div>
          </div>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm text-slate-400">Últimas escaneadas (más reciente primero)</div>
            <div className="flex gap-2">
              <button onClick={renumber}
                className="rounded bg-teal-700 hover:bg-teal-600 px-3 py-1 text-white text-xs font-bold">
                ↕ Renumerar 1..N
              </button>
              <button onClick={deleteAll}
                className="rounded bg-red-800 hover:bg-red-700 px-3 py-1 text-white text-xs font-bold">
                ↻ Borrar todo
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-4">#</th>
                  <th className="pr-4">Valor</th>
                  <th className="pr-4">Estado</th>
                  <th className="pr-4">Operador</th>
                  <th className="pr-4">Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {data.items.map((e) => (
                  <tr key={e.id} className={`border-b border-slate-800/60 ${e.id === lastId ? 'bg-teal-900/40' : ''}`}>
                    <td className="py-1 pr-4 text-slate-400">{e.id}</td>
                    <td className="pr-4 text-white text-base">{e.value}</td>
                    <td className="pr-4">
                      <span className={e.status === 'AVAILABLE' ? 'text-teal-400' : 'text-slate-500'}>{e.status}</span>
                    </td>
                    <td className="pr-4">{e.operator ?? '-'}</td>
                    <td className="pr-4 text-slate-400">{new Date(e.createdAt).toLocaleString()}</td>
                    <td>
                      <button onClick={() => deleteOne(e.id)}
                        className="text-red-400 hover:text-red-300 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
