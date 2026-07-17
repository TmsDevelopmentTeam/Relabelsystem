export type EquipmentType = 'LAPTOP' | 'MONITOR' | 'DESKTOP' | 'OTHER';

export function detectType(producto: string | null | undefined, descripcion?: string | null): EquipmentType {
  const s = ((producto ?? '') + ' ' + (descripcion ?? '')).toLowerCase();
  if (!s.trim()) return 'OTHER';
  if (/\bmonitor\b/.test(s)) return 'MONITOR';
  if (/pc14\d{3}|xcto|\blaptop\b|\bpro\s*1[3-6]\b|latitude|inspiron|thinkpad/.test(s)) return 'LAPTOP';
  if (/slim|qcs|escritorio|desktop|torre|tower|micro\s*form|\bcpu\b/.test(s)) return 'DESKTOP';
  return 'OTHER';
}

export function typeLabel(t: EquipmentType): string {
  return { LAPTOP: '💻 Laptop', MONITOR: '📺 Monitor', DESKTOP: '🖥️ CPU', OTHER: '❓ Otro' }[t];
}

export function labelsPerEquipment(t: EquipmentType): number {
  return t === 'LAPTOP' ? 2 : 1;
}
