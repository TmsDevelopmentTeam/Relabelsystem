import Link from 'next/link';

export default function Home() {
  const steps = [
    { href: '/rollos', title: '🎞️ ROLLOS (pre-carga)', desc: 'Escanea el rollo por orden (USDOM) → cada etiqueta queda con # consecutivo.', color: 'from-teal-600 to-teal-800' },
    { href: '/kroma', title: '📦 MATCH KROMA', desc: '3 escaneos por caja master: ST CPU (caja) → ST CPU (adentro) → ST Monitor (adentro).', color: 'from-fuchsia-600 to-fuchsia-800' },
  ];
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Relabelsystem</h1>
        <p className="text-slate-400">KROMA · Overpacking (CPU + Monitor)</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map((s) => (
          <Link key={s.href} href={s.href}
            className={`block rounded-xl p-6 bg-gradient-to-br ${s.color} hover:scale-[1.02] transition shadow-lg`}>
            <div className="text-2xl font-black text-white">{s.title}</div>
            <div className="text-sm text-white/80 mt-2">{s.desc}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <Link href="/dashboard" className="rounded-lg border border-slate-700 bg-slate-900 p-4 hover:border-sky-500">
          <div className="font-bold text-white">📊 Dashboard</div>
          <div className="text-slate-400 text-xs mt-1">Progreso · export</div>
        </Link>
        <Link href="/monitor" className="rounded-lg border border-slate-700 bg-slate-900 p-4 hover:border-sky-500">
          <div className="font-bold text-white">👁️ Monitor</div>
          <div className="text-slate-400 text-xs mt-1">Supervisión en vivo</div>
        </Link>
        <Link href="/import" className="rounded-lg border border-slate-700 bg-slate-900 p-4 hover:border-sky-500">
          <div className="font-bold text-white">📥 Importar</div>
          <div className="text-slate-400 text-xs mt-1">Catálogo KROMA</div>
        </Link>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm">
        <div className="font-bold text-white mb-2">📌 Flujo KROMA</div>
        <ol className="text-slate-300 space-y-1 list-decimal list-inside">
          <li><b>Rollos</b>: pre-cargar las etiquetas del rollo por orden (USDOM).</li>
          <li><b>Match</b>: por cada caja master, 3 escaneos — ST del CPU en la caja, ST del CPU adentro, y ST del monitor adentro. El sistema valida que sean la pareja correcta.</li>
        </ol>
      </div>
    </div>
  );
}
