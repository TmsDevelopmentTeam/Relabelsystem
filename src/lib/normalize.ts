export function norm(v: string | null | undefined): string {
  if (v == null) return '';
  return String(v).trim().replace(/\s+/g, '').toUpperCase();
}
