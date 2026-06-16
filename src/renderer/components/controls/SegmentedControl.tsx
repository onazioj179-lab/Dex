// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// SegmentedControl -- the ONE pick-one-of-N control for the creative apps.
//
// The creative apps hand-rolled the same `options.map(o => <button active?>)`
// segmented strip ~40 times (Prism selection/gradient/text-align modes, Flux
// modes, ...), each repeating the same active/idle conditional styling. This is
// the single shared, generic, accent-aware implementation. Controlled (parent
// owns value/onChange); options may be bare strings or {value,label,icon,title}.

import React from 'react';

export type SegmentedOption<T extends string> =
  | T
  | { value: T; label?: React.ReactNode; icon?: React.ReactNode; title?: string };

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Per-app accent for the active segment. Defaults to the DEX accent. */
  accentColor?: string;
  /**
   * `outlined` (default): each segment carries a hairline border.
   * `subtle`: borderless, the active segment shows only an accent-tint fill --
   * matches the creative apps' existing inline toolbar segments.
   */
  variant?: 'outlined' | 'subtle';
  size?: 'sm' | 'md';
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
  style?: React.CSSProperties;
}

function optionValue<T extends string>(o: SegmentedOption<T>): T {
  return typeof o === 'string' ? o : o.value;
}

function optionContent<T extends string>(o: SegmentedOption<T>): React.ReactNode {
  if (typeof o === 'string') return o.charAt(0).toUpperCase() + o.slice(1);
  if (o.label !== undefined) return o.label;
  if (o.icon !== undefined) return o.icon;
  return o.value;
}

/**
 * Generic segmented (pick-one) control. Kept as a plain function component (not
 * memo) so the `<T extends string>` generic infers the option/value union at
 * each call site.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accentColor = 'var(--color-accent)',
  variant = 'outlined',
  size = 'sm',
  disabled = false,
  className,
  style,
  ...rest
}: SegmentedControlProps<T>): JSX.Element {
  const subtle = variant === 'subtle';
  return (
    <div
      role="group"
      aria-label={rest['aria-label']}
      className={className}
      style={{ display: 'inline-flex', gap: 4, opacity: disabled ? 0.5 : 1, ...style }}
    >
      {options.map((o) => {
        const v = optionValue(o);
        const active = v === value;
        const tint = `color-mix(in srgb, ${accentColor} ${subtle ? 15 : 16}%, transparent)`;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title={typeof o === 'object' ? o.title : undefined}
            onClick={() => onChange(v)}
            style={{
              padding: size === 'sm' ? '2px var(--space-2)' : '4px var(--space-3)',
              fontSize: 11, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              borderRadius: subtle ? 6 : 4,
              border: subtle ? 'none' : `1px solid ${active ? accentColor : 'var(--color-border-subtle)'}`,
              background: active ? tint : 'transparent',
              color: active ? accentColor : 'var(--color-text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {optionContent(o)}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
