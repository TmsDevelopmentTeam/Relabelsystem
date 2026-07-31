// Utilidades de tiempo en hora de México (UTC−6, sin horario de verano desde 2022).
const MX_OFFSET_MS = 6 * 3600 * 1000;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// "YYYY-MM-DD HH:mm:ss" en hora de México.
export function mxDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (isNaN(t)) return '';
  return new Date(t - MX_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

// Día de la semana en español, hora de México.
export function mxWeekday(d: Date | string | null | undefined): string {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (isNaN(t)) return '';
  return DIAS[new Date(t - MX_OFFSET_MS).getUTCDay()];
}

// Instante UTC de la medianoche de HOY en México (para filtrar "hoy" correcto).
export function startOfTodayMx(): Date {
  const mx = new Date(Date.now() - MX_OFFSET_MS);
  mx.setUTCHours(0, 0, 0, 0);
  return new Date(mx.getTime() + MX_OFFSET_MS);
}
