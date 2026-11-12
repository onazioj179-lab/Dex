// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// CreativeSlider -- the ONE labeled value-slider row for the creative apps.
//
// Every creative app (Prism, Flux, Vinx, Imosion, Forge) had reinvented the
// SAME row by hand ~190 times: `<span label> <input type=range> <span value>`
// with near-identical inline styling that drifted per app. This is the single
// shared implementation of that row, so the design language is consistent and a
// fix/affordance lands everywhere at once. Purely presentational and controlled
// (parent owns value/onChange) so it is a drop-in for the inline pattern.

import React, { memo, useCallback } from 'react';

// Custom slider chrome injected ONCE: a filled track + a premium light thumb that
// grows and glows on hover/drag, so every creative-app slider reads like a pro
// control instead of a browser default. The fill itself is set inline per-render
// (it depends on the value), so the track here stays transparent.
const CSLIDER_CSS = `
.dex-cslider { -webkit-appearance: none; appearance: none; height: 5px; border-radius: 3px; outline: none; cursor: pointer; box-shadow: inset 0 1px 2px rgba(0,0,0,0.5); }
.dex-cslider:disabled { cursor: not-allowed; }
.dex-cslider::-webkit-slider-runnable-track { height: 5px; border-radius: 3px; background: transparent; }
.dex-cslider::-moz-range-track { height: 5px; border-radius: 3px; background: transparent; }
.dex-cslider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 13px; height: 13px; margin-top: -4px; border-radius: 50%; background: radial-gradient(circle at 38% 32%, #ffffff, #c9c9d2); border: 1px solid rgba(0,0,0,0.4); box-shadow: 0 1px 3px rgba(0,0,0,0.55); transition: transform 0.1s ease, box-shadow 0.1s ease; }
.dex-cslider::-moz-range-thumb { width: 13px; height: 13px; border-radius: 50%; background: radial-gradient(circle at 38% 32%, #ffffff, #c9c9d2); border: 1px solid rgba(0,0,0,0.4); box-shadow: 0 1px 3px rgba(0,0,0,0.55); }
.dex-cslider:hover::-webkit-slider-thumb { transform: scale(1.12); }
.dex-cslider:active::-webkit-slider-thumb { transform: scale(1.14); box-shadow: 0 0 0 3px var(--cs-accent, rgba(10,132,255,0.28)); }
.dex-cslider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 2px var(--cs-accent, rgba(10,132,255,0.4)); }
`;
if (typeof document !== 'undefined' && !document.getElementById('dex-cslider-css')) {
  const _el = document.createElement('style');
  _el.id = 'dex-cslider-css';
  _el.textContent = CSLIDER_CSS;
  document.head.appendChild(_el);
}

export interface CreativeSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Left-hand label. Omit for a bare slider. */
  label?: string;
  /** Per-app accent for the track + value readout. Defaults to the DEX accent. */
  accentColor?: string;
  /** Force the readout text (else the number, run through `format`, plus `unit`). */
  displayValue?: string | number;
  /** Format the numeric value for the readout, e.g. `(v) => v.toFixed(1)`. */
  format?: (value: number) => string;
  /** Short unit appended to the readout when no `format`/`displayValue` is given. */
  unit?: string;
  disabled?: boolean;
  /** Fixed label-column width in px (keeps rows aligned). Default 72. */
  labelWidth?: number;
  /** Hide the numeric readout entirely. */
  hideValue?: boolean;
  /**
   * `inline` (default): label | slider | value in one row.
   * `stacked`: a label + value header above a full-width slider -- the idiom the
   * creative inspector panels (Vinx / Imosion / Forge effect panels) already use.
   */
  layout?: 'inline' | 'stacked' | 'column';
  /** 9px micro-labels for dense pro panels (e.g. the DAW mastering rack). */
  dense?: boolean;
  'aria-label'?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const CreativeSlider = memo<CreativeSliderProps>(({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  accentColor = 'var(--color-accent)',
  displayValue,
  format,
  unit,
  disabled = false,
  labelWidth = 72,
  hideValue = false,
  layout = 'inline',
  dense = false,
  className,
  style,
  ...rest
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(parseFloat(e.target.value)),
    [onChange],
  );

  const readout =
    displayValue !== undefined ? String(displayValue)
    : format ? format(value)
    : `${value}${unit ?? ''}`;

  const labelFs = dense ? 9 : 11;

  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  const fill = `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${pct}%, var(--cs-track, var(--color-bg-hover, #26262e)) ${pct}%, var(--cs-track, var(--color-bg-hover, #26262e)) 100%)`;
  const sliderInput = (
    <input
      type="range"
      className="dex-cslider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      aria-label={rest['aria-label'] ?? label}
      style={{
        ...(layout === 'inline' ? { flex: 1, minWidth: 0 } : { width: '100%' }),
        background: fill,
        ['--cs-accent' as any]: accentColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    />
  );

  // Stacked: label + value header above a full-width slider.
  if (layout === 'stacked') {
    return (
      <div className={className} style={{ marginBottom: 'var(--space-2)', opacity: disabled ? 0.5 : 1, ...style }}>
        {(label || !hideValue) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            {label && <span style={{ fontSize: labelFs, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>{label}</span>}
            {!hideValue && <span style={{ fontSize: labelFs, fontWeight: 600, color: accentColor, fontFamily: 'var(--font-mono)' }}>{readout}</span>}
          </div>
        )}
        {sliderInput}
      </div>
    );
  }

  // Column: label on top, full-width slider, value centered below -- the compact
  // mixer-cell idiom (e.g. Imosion instrument Volume/Pan).
  if (layout === 'column') {
    return (
      <div className={className} style={{ marginBottom: 'var(--space-2)', opacity: disabled ? 0.5 : 1, ...style }}>
        {label && <div style={{ fontSize: labelFs, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{label}</div>}
        {sliderInput}
        {!hideValue && <div style={{ fontSize: labelFs, fontWeight: 600, color: accentColor, fontFamily: 'var(--font-mono)', textAlign: 'center', marginTop: 4 }}>{readout}</div>}
      </div>
    );
  }

  // Inline: label | slider | value in one row.
  return (
    <div
      className={className}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        marginBottom: 'var(--space-2)', opacity: disabled ? 0.5 : 1, ...style,
      }}
    >
      {label && (
        <span style={{
          width: labelWidth, flexShrink: 0,
          fontSize: labelFs, fontWeight: 600, color: 'var(--color-text-tertiary)',
        }}>
          {label}
        </span>
      )}
      {sliderInput}
      {!hideValue && (
        <span style={{
          width: 40, flexShrink: 0, textAlign: 'right',
          fontSize: labelFs, fontWeight: 600, color: accentColor, fontFamily: 'var(--font-mono)',
        }}>
          {readout}
        </span>
      )}
    </div>
  );
});

CreativeSlider.displayName = 'CreativeSlider';

export default CreativeSlider;
