import React, { useCallback, useRef, useId } from 'react';

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

  const uid = useId().replace(/:/g, '');
  const capR = r - 5;
  const valueArcD = bipolar
    ? (norm >= 0.5 ? arcPath(cx, cy, r, START + 0.5 * SWEEP, angle) : arcPath(cx, cy, r, angle, START + 0.5 * SWEEP))
    : arcPath(cx, cy, r, START, angle);
  const pIn = polar(cx, cy, capR * 0.30, angle);   // indicator base (on the cap)
  const pOut = polar(cx, cy, capR - 1, angle);     // indicator tip
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
        <defs>
          {/* Domed metal cap: light catches the upper-left, falls to near-black. */}
          <radialGradient id={`kb${uid}`} cx="50%" cy="36%" r="68%">
            <stop offset="0%" stopColor="#43434e" />
            <stop offset="52%" stopColor="#202026" />
            <stop offset="100%" stopColor="#0e0e12" />
          </radialGradient>
          {/* Beveled rim ring. */}
          <linearGradient id={`kr${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b5b66" />
            <stop offset="100%" stopColor="#1b1b21" />
          </linearGradient>
          <filter id={`ks${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1" stdDeviation="0.7" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>
        {/* track */}
        <path d={arcPath(cx, cy, r, START, START + SWEEP)} fill="none" stroke="#2a2a30" strokeWidth={3} strokeLinecap="round" />
        {/* value arc -- single crisp line, no bloom */}
        <path d={valueArcD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        {/* beveled rim (sits on the panel with a drop shadow) */}
        <circle cx={cx} cy={cy} r={r - 2.5} fill={`url(#kr${uid})`} filter={`url(#ks${uid})`} />
        {/* domed metal cap */}
        <circle cx={cx} cy={cy} r={capR} fill={`url(#kb${uid})`} stroke="#0b0b0f" strokeWidth={0.75} />
        {/* top sheen */}
        <ellipse cx={cx} cy={cy - capR * 0.34} rx={capR * 0.52} ry={capR * 0.26} fill="#ffffff" opacity={0.07} />
        {/* indicator notch + glowing tip */}
        <line x1={pIn.x} y1={pIn.y} x2={pOut.x} y2={pOut.y} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={pOut.x} cy={pOut.y} r={1.5} fill={color} />
        {bipolar && <circle cx={center.x} cy={center.y} r={1.2} fill="#6a6a74" />}
      </svg>
      {valueLabel !== undefined && (
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', minWidth: 28, textAlign: 'center' }}>{valueLabel}</span>
      )}
    </div>
  );
};

export default Knob;
