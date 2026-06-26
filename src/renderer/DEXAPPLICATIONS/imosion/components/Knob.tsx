import React, { useCallback, useRef } from 'react';

// A real rotary knob: 270-degree sweep, drag up/down to turn, shift = fine,
// double-click to reset, scroll wheel to nudge. Pure SVG, no deps. Built to look
// like a hardware control (arc track + value arc + pointer cap), matching the
// pro-DAW reference Imosion is targeting.
export interface KnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label?: string;
  /** Formatted readout under the knob. If omitted, no readout is shown. */
  valueLabel?: string;
  size?: number;
  color?: string;
  /** Resets here on double-click. Defaults to the midpoint. */
  defaultValue?: number;
  /** Fill the value arc from the center instead of the start (pan-style). */
  bipolar?: boolean;
  disabled?: boolean;
  title?: string;
}

const START = -135; // degrees, 0 = straight up
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const start = polar(cx, cy, r, a1);
  const end = polar(cx, cy, r, a0);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export const Knob: React.FC<KnobProps> = ({ value, min, max, onChange, label, valueLabel, size = 44, color = '#a8744a', defaultValue, bipolar = false, disabled = false, title }) => {
  const dragRef = useRef<{ y: number; v: number } | null>(null);
  // Coalesce drag updates to one per frame so a fast drag can't fire 120 state
  // updates/sec (each re-runs the parent render) — this is the mixer-lag fix.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const angle = START + norm * SWEEP;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  const apply = useCallback((v: number) => onChange(Math.max(min, Math.min(max, v))), [onChange, min, max]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { y: e.clientY, v: value };
  }, [disabled, value]);

  const handleMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.y - e.clientY;
    const span = max - min;
    const sens = (e.shiftKey ? span / 1200 : span / 200);
    pendingRef.current = dragRef.current.v + dy * sens;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingRef.current != null) apply(pendingRef.current);
      });
    }
  }, [apply, max, min]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (pendingRef.current != null) { apply(pendingRef.current); pendingRef.current = null; }
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, [apply]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (disabled) return;
    const span = max - min;
    const step = (e.shiftKey ? span / 200 : span / 50);
    apply(value + (e.deltaY < 0 ? step : -step));
  }, [apply, disabled, max, min, value]);

  const ptr = polar(cx, cy, r - 3, angle);
  const center = polar(cx, cy, r, START + 0.5 * SWEEP);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, userSelect: 'none', opacity: disabled ? 0.45 : 1 }}>
      {label && <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</span>}
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ cursor: disabled ? 'default' : 'ns-resize', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={handleMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => !disabled && apply(defaultValue ?? (min + max) / 2)}
        onWheel={onWheel}
      >
        {/* track */}
        <path d={arcPath(cx, cy, r, START, START + SWEEP)} fill="none" stroke="#2a2a30" strokeWidth={3} strokeLinecap="round" />
        {/* value arc */}
        <path
          d={bipolar
            ? (norm >= 0.5 ? arcPath(cx, cy, r, START + 0.5 * SWEEP, angle) : arcPath(cx, cy, r, angle, START + 0.5 * SWEEP))
            : arcPath(cx, cy, r, START, angle)}
          fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
        />
        {/* knob body */}
        <circle cx={cx} cy={cy} r={r - 5} fill="#16161a" stroke="#3a3a42" strokeWidth={1} />
        {/* pointer */}
        <line x1={cx} y1={cy} x2={ptr.x} y2={ptr.y} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        {bipolar && <circle cx={center.x} cy={center.y} r={1.2} fill="#5a5a64" />}
      </svg>
      {valueLabel !== undefined && (
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', minWidth: 28, textAlign: 'center' }}>{valueLabel}</span>
      )}
    </div>
  );
};

export default Knob;
