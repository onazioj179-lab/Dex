// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Three-way color wheel (DaVinci-style)
 * Hue wheel + master vertical slider. Center = neutral.
 */

import React, { useCallback, useEffect, useRef } from 'react';

export interface ColorWheelValue {
  r: number;
  g: number;
  b: number;
  master: number;
}

interface Props {
  label: string;
  value: ColorWheelValue;
  onChange: (v: ColorWheelValue) => void;
  size?: number;
}

// HSV -> RGB (s,v in 0..1, h in degrees)
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) { r = c; g = x; b = 0; }
  else if (hp < 2) { r = x; g = c; b = 0; }
  else if (hp < 3) { r = 0; g = c; b = x; }
  else if (hp < 4) { r = 0; g = x; b = c; }
  else if (hp < 5) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const m = v - c;
  return [r + m, g + m, b + m];
}

const wrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  padding: 4, userSelect: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  color: 'var(--color-text-secondary)', textTransform: 'uppercase',
};

const readoutStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '2px 6px',
  fontSize: 9, fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-tertiary)',
};

export const ColorWheel: React.FC<Props> = ({ label, value, onChange, size = 120 }) => {
  const wheelRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragWheel = useRef(false);
  const dragSlider = useRef(false);

  const radius = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;

  // Convert current r/g/b back to position (best-effort: use r,b channels for x/y placement
  // since they map closest to hue extremes; this avoids needing to invert HSV)
  // We store position implicitly by re-deriving from r,g,b magnitude and hue angle.
  // For drawing the indicator we approximate by detecting the dominant channel.
  const indicator = (() => {
    const r = value.r, g = value.g, b = value.b;
    const max = Math.max(Math.abs(r), Math.abs(g), Math.abs(b));
    if (max < 0.0001) return { x: cx, y: cy };
    // Find approximate hue from r,g,b (treating as positive offsets)
    const rr = Math.max(0, r), gg = Math.max(0, g), bb = Math.max(0, b);
    const sum = rr + gg + bb || 1;
    const fr = rr / sum, fg = gg / sum, fb = bb / sum;
    // Place indicator at angle weighted by the three channel base angles (0, 120, 240)
    const ax = fr * Math.cos(0) + fg * Math.cos((2 * Math.PI) / 3) + fb * Math.cos((4 * Math.PI) / 3);
    const ay = fr * Math.sin(0) + fg * Math.sin((2 * Math.PI) / 3) + fb * Math.sin((4 * Math.PI) / 3);
    const mag = Math.min(1, max) * radius;
    const norm = Math.hypot(ax, ay) || 1;
    return { x: cx + (ax / norm) * mag, y: cy - (ay / norm) * mag };
  })();

  // Draw hue wheel
  useEffect(() => {
    const cv = wheelRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = cy - y;
        const dist = Math.hypot(dx, dy);
        const i = (y * size + x) * 4;
        if (dist > radius) {
          d[i + 3] = 0;
          continue;
        }
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const h = (angle + 360) % 360;
        const s = Math.min(1, dist / radius);
        const [r, g, b] = hsvToRgb(h, s, 1);
        d[i] = Math.round(r * 255);
        d[i + 1] = Math.round(g * 255);
        d[i + 2] = Math.round(b * 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Subtle ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [size, radius, cx, cy]);

  const updateFromWheel = useCallback((clientX: number, clientY: number) => {
    const cv = wheelRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dx = clientX - rect.left - cx;
    const dy = cy - (clientY - rect.top);
    const dist = Math.hypot(dx, dy);
    const sat = Math.min(1, dist / radius);
    if (dist < 0.0001) {
      onChange({ r: 0, g: 0, b: 0, master: value.master });
      return;
    }
    const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const [r, g, b] = hsvToRgb(angleDeg, sat, 1);
    // Center = neutral; remap rgb so neutral is 0 (subtract 1/3 average)
    const avg = (r + g + b) / 3;
    onChange({
      r: (r - avg) * sat,
      g: (g - avg) * sat,
      b: (b - avg) * sat,
      master: value.master,
    });
  }, [cx, cy, radius, onChange, value.master]);

  const onWheelDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragWheel.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromWheel(e.clientX, e.clientY);
  }, [updateFromWheel]);

  const onWheelMove = useCallback((e: React.PointerEvent) => {
    if (!dragWheel.current) return;
    updateFromWheel(e.clientX, e.clientY);
  }, [updateFromWheel]);

  const onWheelUp = useCallback(() => { dragWheel.current = false; }, []);

  const updateMasterFromY = useCallback((clientY: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    // top = +1, bottom = -1
    const master = 1 - ratio * 2;
    onChange({ r: value.r, g: value.g, b: value.b, master });
  }, [onChange, value.r, value.g, value.b]);

  const onSliderDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragSlider.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateMasterFromY(e.clientY);
  }, [updateMasterFromY]);

  const onSliderMove = useCallback((e: React.PointerEvent) => {
    if (!dragSlider.current) return;
    updateMasterFromY(e.clientY);
  }, [updateMasterFromY]);

  const onSliderUp = useCallback(() => { dragSlider.current = false; }, []);

  const reset = useCallback(() => {
    onChange({ r: 0, g: 0, b: 0, master: 0 });
  }, [onChange]);

  const masterRatio = (1 - value.master) / 2;

  return (
    <div style={wrapStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ position: 'relative', width: size, height: size }}>
          <canvas
            ref={wheelRef}
            width={size}
            height={size}
            onPointerDown={onWheelDown}
            onPointerMove={onWheelMove}
            onPointerUp={onWheelUp}
            onDoubleClick={reset}
            style={{
              cursor: 'crosshair', borderRadius: '50%', touchAction: 'none',
              display: 'block',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: indicator.x - 5, top: indicator.y - 5,
              width: 10, height: 10, borderRadius: '50%',
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid rgba(0,0,0,0.85)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
            }}
          />
        </div>
        <div
          ref={sliderRef}
          onPointerDown={onSliderDown}
          onPointerMove={onSliderMove}
          onPointerUp={onSliderUp}
          onDoubleClick={() => onChange({ r: value.r, g: value.g, b: value.b, master: 0 })}
          style={{
            position: 'relative', width: 12, height: size,
            background: 'linear-gradient(to bottom, #FFFFFF 0%, #808080 50%, #000000 100%)',
            borderRadius: 2, cursor: 'ns-resize', touchAction: 'none',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            style={{
              position: 'absolute', left: -2, right: -2,
              top: `calc(${masterRatio * 100}% - 1.5px)`,
              height: 3, background: 'var(--color-accent)',
              boxShadow: '0 0 2px rgba(0,0,0,0.8)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
      <span style={labelStyle}>{label}</span>
      <div style={readoutStyle}>
        <span>R</span><span>{value.r.toFixed(3)}</span>
        <span>G</span><span>{value.g.toFixed(3)}</span>
        <span>B</span><span>{value.b.toFixed(3)}</span>
        <span>M</span><span>{value.master.toFixed(3)}</span>
      </div>
    </div>
  );
};

ColorWheel.displayName = 'VinxColorWheel';

export default ColorWheel;
