import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Relabelsystem — Reetiquetado Telcel',
  description: 'Rollos → Ubicar → Etiquetar → Match',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <nav className="border-b border-slate-800 bg-slate-950/70 backdrop-blur px-4 py-3 flex gap-4 items-center flex-wrap text-sm">
          <Link href="/" className="font-bold text-base text-white">Relabelsystem</Link>
          <Link href="/rollos" className="hover:text-white text-slate-300">🎞️ Rollos</Link>
          <Link href="/paso2" className="hover:text-white text-slate-300">① Ubicar</Link>
          <Link href="/paso3" className="hover:text-white text-slate-300">② Etiquetar</Link>
          <Link href="/paso4" className="hover:text-white text-slate-300">③ Match</Link>
          <span className="text-slate-600">·</span>
          <Link href="/dashboard" className="hover:text-white text-slate-300">Dashboard</Link>
          <Link href="/import" className="hover:text-white text-slate-300">Import</Link>
        </nav>
        <main className="p-4 sm:p-6">{children}</main>
      </body>
    </html>
  );
}
