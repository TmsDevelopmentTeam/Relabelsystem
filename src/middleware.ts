import { NextRequest, NextResponse } from 'next/server';

// === BAJA TEMPORAL DEL SISTEMA ===
// El sistema está cerrado por exposición de seguridad, en lo que se asegura por el core.
// Intercepta TODAS las rutas (páginas y API) y responde "Closed for now".
//
// Para REABRIR: definir la variable de entorno SITE_ENABLED=true en el VPS
// (archivo .env de la app) y reiniciar con PM2 (pm2 reload relabelsystem --update-env).
// Mientras esa variable no sea exactamente "true", el sitio queda cerrado.

export const config = {
  // Corre en todo excepto assets estáticos de Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

const PAGE = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Closed for now</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(1200px 600px at 50% -10%, #0f2744, #060a12 60%);
    color: #e5eefc; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    padding: 24px;
  }
  .card {
    width: 100%; max-width: 440px; text-align: center;
    background: rgba(15, 23, 42, 0.72); border: 1px solid rgba(148,163,184,0.18);
    border-radius: 20px; padding: 40px 28px; box-shadow: 0 30px 80px rgba(0,0,0,0.45);
    backdrop-filter: blur(6px);
  }
  .lock { font-size: 56px; line-height: 1; margin-bottom: 14px; }
  h1 { margin: 0 0 8px; font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
  p { margin: 6px 0; color: #9fb2cc; font-size: 15px; line-height: 1.5; }
  .pill {
    display: inline-block; margin-top: 18px; padding: 7px 14px; border-radius: 999px;
    background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.35);
    color: #7dd3fc; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  }
  .foot { margin-top: 22px; font-size: 12px; color: #5b6b82; }
</style>
</head>
<body>
  <div class="card">
    <div class="lock">🔒</div>
    <h1>Closed for now</h1>
    <p>El sistema está temporalmente fuera de servicio por mantenimiento de seguridad.</p>
    <p>Volveremos a estar disponibles en breve.</p>
    <span class="pill">Mantenimiento</span>
    <div class="foot">Relabelsystem · TMS</div>
  </div>
</body>
</html>`;

export function middleware(_req: NextRequest) {
  if (process.env.SITE_ENABLED === 'true') {
    return NextResponse.next();
  }
  const isApi = _req.nextUrl.pathname.startsWith('/api');
  if (isApi) {
    return NextResponse.json(
      { ok: false, closed: true, message: 'Closed for now — sistema en mantenimiento de seguridad.' },
      { status: 503, headers: { 'Retry-After': '3600' } },
    );
  }
  return new NextResponse(PAGE, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3600', 'Cache-Control': 'no-store' },
  });
}
