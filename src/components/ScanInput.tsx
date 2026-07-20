'use client';

import { useEffect, useRef } from 'react';

export function ScanInput({
  value, onChange, onSubmit, placeholder, disabled, borderColor = 'border-sky-500',
  armed = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  borderColor?: string;
  armed?: boolean; // Cuando true: autofocus agresivo. Cuando false: input normal, se puede clickear afuera.
}) {
  const ref = useRef<HTMLInputElement>(null);

  // Focus inicial siempre que se monta o cuando pasa a armed
  useEffect(() => {
    if (armed) ref.current?.focus();
  }, [armed]);

  // Autofocus agresivo SOLO cuando armed=true.
  useEffect(() => {
    if (!armed) return;
    function ensureFocus() {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (!active || active === document.body || tag === 'HTML') {
        ref.current?.focus();
      }
    }
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, button, a, textarea, select, [role="button"]')) return;
      setTimeout(() => ref.current?.focus(), 10);
    }
    document.addEventListener('click', onDocClick);
    const iv = setInterval(ensureFocus, 500);
    return () => { document.removeEventListener('click', onDocClick); clearInterval(iv); };
  }, [armed]);

  return (
    <input
      ref={ref}
      autoFocus={armed}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
      onBlur={armed ? () => setTimeout(() => ref.current?.focus(), 100) : undefined}
      placeholder={placeholder ?? 'Escanea…'}
      className={`w-full rounded bg-slate-950 border-2 ${armed ? borderColor : 'border-slate-700'} px-4 py-4 text-2xl font-mono tracking-wider focus:outline-none disabled:opacity-50`}
      disabled={disabled}
    />
  );
}

export function beepOK() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch {}
}

export function siren() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'square'; o.frequency.value = i % 2 === 0 ? 300 : 180;
      const t = now + i * 0.28;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.start(t); o.stop(t + 0.26);
    }
    if (typeof navigator !== 'undefined' && (navigator as any).vibrate) {
      (navigator as any).vibrate([200, 100, 200, 100, 400]);
    }
  } catch {}
}

export function useOperator() {
  const key = 'operator';
  const get = () => (typeof window !== 'undefined' ? localStorage.getItem(key) ?? '' : '');
  const set = (v: string) => { if (typeof window !== 'undefined') localStorage.setItem(key, v); };
  return { get, set };
}
