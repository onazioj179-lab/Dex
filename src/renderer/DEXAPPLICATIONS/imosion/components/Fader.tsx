// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React, { useCallback, useRef } from 'react';

// A real vertical fader: grab the cap and drag (relative, so it never jumps),
// shift = fine, double-click to reset. Optional level meter rides alongside it,
// and an optional dB scale is drawn down the side. Matches the pro-DAW reference.
export interface FaderProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  height?: number;
  color?: string;
  defaultValue?: number;
  /** 0..1 meter level shown beside the fader. Omit to hide the meter. */
  meter?: number;
  /** Scale ticks (in value units) drawn + labelled on the left. */
  ticks?: { at: number; label: string }[];
  /** Value where the "unity"/0 reference line is drawn. */
  unity?: number;
  /** When set, the meter element carries data-imosion-meter=<id> so a shared rAF
   *  can write its live level directly to the DOM (no React re-render). */
  meterId?: string;
  title?: string;
}

export const Fader: React.FC<FaderProps> = ({ value, min, max, onChange, height = 150, color = '#a8744a', defaultValue, meter, ticks, unity, meterId, title }) => {
  const dragRef = useRef<{ y: number; v: number } | null>(null);
  // Coalesce drag updates to one per frame (mixer-lag fix).
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const span = max - min || 1;
  const norm = Math.max(0, Math.min(1, (value - min) / span));
  const pct = norm * 100;

  const apply = useCallback((v: number) => onChange(Math.max(min, Math.min(max, v))), [onChange, min, max]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { y: e.clientY, v: value };
  }, [value]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.y - e.clientY;
    const sens = (e.shiftKey ? 0.2 : 1) * (span / height);
    pendingRef.current = dragRef.current.v + dy * sens;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingRef.current != null) apply(pendingRef.current);
      });
    }
  }, [apply, span, height]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (pendingRef.current != null) { apply(pendingRef.current); pendingRef.current = null; }
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, [apply]);

  const meterPct = meter !== undefined ? Math.max(0, Math.min(1, meter)) * 100 : 0;
  const meterColor = meterPct > 90 ? 'var(--color-error)' : meterPct > 72 ? 'var(--color-warning)' : '#4f8a60';

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 6, height, userSelect: 'none' }}>
      {/* dB scale */}
      {ticks && (
        <div style={{ position: 'relative', width: 18, flexShrink: 0 }}>
          {ticks.map(t => {
            const tn = (t.at - min) / span;
            return (
              <span key={t.at} style={{ position: 'absolute', right: 0, bottom: `calc(${tn * 100}% - 4px)`, fontSize: 7, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{t.label}</span>
            );
          })}
        </div>
      )}
      {/* groove + cap */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => apply(defaultValue ?? (min + max) / 2)}
        style={{ position: 'relative', width: 14, cursor: 'ns-resize', touchAction: 'none' }}
      >
        {/* groove */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0, bottom: 0, width: 6, background: 'linear-gradient(90deg,#08080a,#18181c,#08080a)', borderRadius: 4, border: '1px solid #050507', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.7)' }} />
        {/* unity line */}
        {unity !== undefined && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${((unity - min) / span) * 100}%`, height: 1, background: 'rgba(255,255,255,0.2)' }} />
        )}
        {/* fill */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 0, width: 6, height: `${pct}%`, background: `linear-gradient(to top, ${color}99, ${color})`, borderRadius: 3 }} />
        {/* cap -- console-style fader knob: bevelled body, two grip ridges, and a
            glowing centre indicator line */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: `calc(${pct}% - 7px)`, width: 24, height: 14, background: 'linear-gradient(180deg,#52525c,#34343c 45%,#1a1a20)', borderRadius: 3, border: '1px solid #050507', boxShadow: '0 3px 6px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: 3, right: 3, top: 3, height: 1, background: 'rgba(255,255,255,0.10)' }} />
          <div style={{ position: 'absolute', left: 3, right: 3, bottom: 3, height: 1, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'absolute', left: 2, right: 2, top: '50%', transform: 'translateY(-50%)', height: 2, background: color, opacity: 0.95, borderRadius: 1, boxShadow: `0 0 3px ${color}` }} />
        </div>
      </div>
      {/* meter — live level written straight to the DOM via data-imosion-meter */}
      {(meter !== undefined || meterId) && (
        <div style={{ position: 'relative', width: 6, flexShrink: 0, background: '#0a0a0c', borderRadius: 3, overflow: 'hidden', border: '1px solid #050507' }}>
          <div data-imosion-meter={meterId} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${meterPct}%`, background: meterColor, transition: 'height 0.05s linear', willChange: 'height' }} />
        </div>
      )}
    </div>
  );
};

export default Fader;
