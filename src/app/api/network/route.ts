import { NextResponse } from 'next/server';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Devuelve las IPs locales del server para que la otra PC se pueda conectar
export async function GET() {
  const ifaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const i of list) {
      if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
    }
  }
  const port = process.env.PORT ?? '3000';
  return NextResponse.json({
    ips,
    port,
    urls: ips.map((ip) => `http://${ip}:${port}`),
  });
}
