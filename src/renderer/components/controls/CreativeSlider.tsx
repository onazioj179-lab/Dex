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
          fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
        }}>
          {label}
        </span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        aria-label={rest['aria-label'] ?? label}
        style={{ flex: 1, minWidth: 0, height: 4, accentColor, cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      {!hideValue && (
        <span style={{
          width: 40, flexShrink: 0, textAlign: 'right',
          fontSize: 11, fontWeight: 600, color: accentColor, fontFamily: 'var(--font-mono)',
        }}>
          {readout}
        </span>
      )}
    </div>
  );
});

CreativeSlider.displayName = 'CreativeSlider';

export default CreativeSlider;
