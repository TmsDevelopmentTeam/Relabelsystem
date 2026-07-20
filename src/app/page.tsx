import Link from 'next/link';

export default function Home() {
  const steps = [
    { href: '/paso1', title: '① TAG', desc: 'Escanea Asset Tags → los ubica en cuadrantes del tablero.', color: 'from-sky-600 to-sky-800' },
    { href: '/paso2', title: '② PAIR', desc: 'Escanea etiquetas grandes → sistema dice cuadrante donde va (arma paquetes).', color: 'from-amber-600 to-amber-800' },
    { href: '/paso3', title: '③ LABEL', desc: 'Línea de producción: escanea Asset Tag → toma paquete de etiquetas → pega.', color: 'from-purple-600 to-purple-800' },
    { href: '/paso4', title: '④ MATCH', desc: 'Verificación triple: etiqueta pequeña + Asset Tag + etiqueta grande.', color: 'from-emerald-600 to-emerald-800' },
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

      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <Link href="/board" className="rounded-lg border border-slate-700 bg-slate-900 p-4 hover:border-sky-500">
          <div className="font-bold text-white">🗂 Tablero</div>
          <div className="text-slate-400 text-xs mt-1">Vista matriz en vivo</div>
        </Link>
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
        <div className="font-bold text-white mb-2">📌 Cómo se usa (scanner USB)</div>
        <ol className="text-slate-300 space-y-1 list-decimal list-inside">
          <li>Enchufa el scanner USB — se comporta como teclado, no requiere drivers.</li>
          <li>Abre uno de los pasos ① ② ③ ④. El cursor queda en el input.</li>
          <li>Apunta al código de barras y dispara. La app procesa y muestra el resultado.</li>
          <li>El cursor vuelve solo al input — sigue disparando el siguiente.</li>
        </ol>
      </div>
    </div>
  );
}
