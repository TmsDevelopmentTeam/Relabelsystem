import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Copia de seguridad del archivo SQLite. Se llama ANTES de cualquier cambio a la BD.
// GET /api/admin/backup?motivo=xxx  -> crea prisma/backups/relabelsystem_<ts>_<motivo>.db
export function GET(req: Request) {
  try {
    const motivo = (new URL(req.url).searchParams.get('motivo') || 'manual').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const cwd = process.cwd();
    // ubicaciones posibles del .db
    const candidates = [
      path.join(cwd, 'prisma', 'relabelsystem.db'),
      path.join(cwd, 'relabelsystem.db'),
    ];
    const src = candidates.find((p) => fs.existsSync(p));
    if (!src) return NextResponse.json({ ok: false, error: 'No se encontró el archivo .db', buscado: candidates });

    const dir = path.join(cwd, 'prisma', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const dest = path.join(dir, `relabelsystem_${ts}_${motivo}.db`);
    fs.copyFileSync(src, dest);
    const size = fs.statSync(dest).size;

    // listar backups existentes (últimos 15)
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().reverse();
    return NextResponse.json({ ok: true, backup: path.basename(dest), sizeKB: Math.round(size / 1024), total: all.length, recientes: all.slice(0, 15) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 500 });
  }
}
