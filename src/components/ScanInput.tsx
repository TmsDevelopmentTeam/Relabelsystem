'use client';

import { useEffect, useRef } from 'react';

export function ScanInput({
  value, onChange, onSubmit, placeholder, disabled, borderColor = 'border-sky-500',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  borderColor?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <input
      ref={ref}
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
      onBlur={() => setTimeout(() => ref.current?.focus(), 100)}
      placeholder={placeholder ?? 'Escanea…'}
      className={`w-full rounded bg-slate-950 border-2 ${borderColor} px-4 py-4 text-2xl font-mono tracking-wider focus:outline-none`}
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
