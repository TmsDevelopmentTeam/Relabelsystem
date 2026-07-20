import Link from 'next/link';

export default function Home() {
  const steps = [
    { href: '/rollos', title: '🎞️ ROLLOS (pre-carga)', desc: 'Escanea todo el rollo → cada etiqueta queda con # consecutivo automático.', color: 'from-teal-600 to-teal-800' },
    { href: '/paso2', title: '① UBICAR', desc: 'Escanea Asset Tag o etiqueta → sistema te dice en qué posición del rollo está.', color: 'from-amber-600 to-amber-800' },
    { href: '/paso3', title: '② ETIQUETAR', desc: 'Línea: escanea Asset Tag → dice qué pegar y su # de rollo. Marca LABELED.', color: 'from-purple-600 to-purple-800' },
    { href: '/paso4', title: '③ MATCH', desc: 'Verificación triple: etiqueta pequeña + Asset Tag + etiqueta grande.', color: 'from-emerald-600 to-emerald-800' },
  ];
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Relabelsystem</h1>
        <p className="text-slate-400">Reetiquetado Telcel · Radiomovil Dipsa</p>
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

      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <Link href="/dashboard" className="rounded-lg border border-slate-700 bg-slate-900 p-4 hover:border-sky-500">
          <div className="font-bold text-white">📊 Dashboard</div>
          <div className="text-slate-400 text-xs mt-1">Progreso · export</div>
        </Link>
        <Link href="/import" className="rounded-lg border border-slate-700 bg-slate-900 p-4 hover:border-sky-500">
          <div className="font-bold text-white">📥 Importar Excel</div>
          <div className="text-slate-400 text-xs mt-1">Reporte de activos</div>
        </Link>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm">
        <div className="font-bold text-white mb-2">📌 Flujo de operación</div>
        <ol className="text-slate-300 space-y-1 list-decimal list-inside">
          <li><b>Rollos</b>: pre-cargar TODAS las etiquetas del rollo antes de arrancar la línea.</li>
          <li><b>① Ubicar</b>: para saber en qué posición del rollo está la etiqueta que necesitas.</li>
          <li><b>② Etiquetar</b>: en la línea, pega la etiqueta al equipo y a la caja.</li>
          <li><b>③ Match</b>: verificación final triple antes de enviar la caja.</li>
        </ol>
      </div>
    </div>
  );
}
