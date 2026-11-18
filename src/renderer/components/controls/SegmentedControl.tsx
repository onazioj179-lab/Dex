// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DexSegmentedControl: one outer capsule; segments sit inside it with an equal
// inset, and the selected highlight's radius is the outer radius minus that
// inset, so it can never exceed the capsule or turn rectangular inside a pill.
// A radio group: arrows / Home / End move the selection, one tab stop.

import React, { useRef } from 'react';
import {
  CAPSULE_HEIGHT, CAPSULE_INSET, CAPSULE_FONT, CAPSULE_PAD_X, capsuleRadii,
  CAPSULE_SELECTED_BG, CAPSULE_HOVER_BG, type CapsuleSize,
} from './capsuleTokens';

export type SegmentedOption<T extends string> =
  | T
  | { value: T; label?: React.ReactNode; icon?: React.ReactNode; title?: string; disabled?: boolean; testId?: string };

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** @deprecated selection uses the DEX accent tint everywhere. */
  accentColor?: string;
  /** `outlined` (default): hairline capsule border. `subtle`: no border (toolbars, creative apps). */
  variant?: 'outlined' | 'subtle';
  /** Stretch segments to equal width, filling the row. */
  fill?: boolean;
  /** Lay segments out as a grid of N equal columns (rounded rectangle, not a pill). */
  columns?: number;
  size?: CapsuleSize;
  /** 'radio' (pick a value, default) or 'tabs' (switch views: tablist/tab/aria-selected). */
  semantics?: 'radio' | 'tabs';
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
  if (o.label !== undefined && o.icon !== undefined) return <>{o.icon}{o.label}</>;
  if (o.label !== undefined) return o.label;
  if (o.icon !== undefined) return o.icon;
  return o.value;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = 'outlined',
  fill = false,
  columns,
  size = 'sm',
  semantics = 'radio',
  disabled = false,
  className,
  style,
  ...rest
}: SegmentedControlProps<T>): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const rows = columns ? Math.ceil(options.length / columns) : 1;
  // Exact concentric geometry: the outline is part of the inset, so a single row
  // is a true pill (radius = full outer height / 2) and the highlight radius is
  // that minus padding + border. Multi-row grids use a 10 px rounded rectangle.
  const border = variant === 'outlined' ? 1 : 0;
  const segH = CAPSULE_HEIGHT[size] - CAPSULE_INSET * 2;
  const totalInset = CAPSULE_INSET + border;
  const outer = rows > 1 ? capsuleRadii(size, rows).outer : (segH + totalInset * 2) / 2;
  const inner = rows > 1 ? Math.max(0, outer - totalInset) : segH / 2;
  const values = options.map(optionValue);
  const enabled = (i: number) => !disabled && !(typeof options[i] === 'object' && (options[i] as { disabled?: boolean }).disabled);

  const move = (from: number, dir: 1 | -1 | 'home' | 'end') => {
    const n = options.length;
    let i = dir === 'home' ? 0 : dir === 'end' ? n - 1 : from;
    for (let k = 0; k < n; k++) {
      if (dir === 1 || dir === -1) i = (i + dir + n) % n;
      if (enabled(i)) break;
      if (dir === 'home') i = (i + 1) % n;
      if (dir === 'end') i = (i - 1 + n) % n;
    }
    if (!enabled(i)) return;
    onChange(values[i]);
    refs.current[i]?.focus();
  };

  return (
    <div
      role={semantics === 'tabs' ? 'tablist' : 'radiogroup'}
      aria-label={rest['aria-label']}
      aria-disabled={disabled || undefined}
      className={className}
      data-dex-capsule="segmented"
      style={{
        display: columns ? 'grid' : (fill ? 'flex' : 'inline-flex'),
        gridTemplateColumns: columns ? `repeat(${columns}, 1fr)` : undefined,
        width: (columns || fill) ? '100%' : undefined,
        alignItems: 'center',
        gap: 0,
        padding: CAPSULE_INSET,
        borderRadius: outer,
        border: variant === 'outlined' ? '1px solid var(--color-border-subtle)' : 'none',
        background: 'color-mix(in srgb, var(--color-text-primary, #fff) 5%, transparent)',
        opacity: disabled ? 0.5 : 1,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {options.map((o, i) => {
        const v = values[i];
        const active = v === value;
        const title = typeof o === 'object' ? o.title : undefined;
        return (
          <button
            key={v}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role={semantics === 'tabs' ? 'tab' : 'radio'}
            aria-checked={semantics === 'tabs' ? undefined : active}
            aria-selected={semantics === 'tabs' ? active : undefined}
            aria-label={typeof o === 'object' && o.label === undefined && o.icon !== undefined ? (title ?? v) : undefined}
            title={typeof o === 'object' ? title : undefined}
            disabled={!enabled(i)}
            tabIndex={active || (!values.includes(value) && i === 0) ? 0 : -1}
            onClick={() => onChange(v)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
              else if (e.key === 'Home') { e.preventDefault(); move(i, 'home'); }
              else if (e.key === 'End') { e.preventDefault(); move(i, 'end'); }
            }}
            onMouseEnter={(e) => { if (!active && enabled(i)) e.currentTarget.style.background = CAPSULE_HOVER_BG; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            data-active={active || undefined}
            data-testid={typeof o === 'object' ? o.testId : undefined}
            style={{
              height: segH,
              padding: `0 ${CAPSULE_PAD_X[size]}px`,
              fontSize: CAPSULE_FONT[size],
              fontWeight: active ? 600 : 500,
              lineHeight: 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              ...(fill || columns ? { flex: 1, minWidth: 0 } : {}),
              borderRadius: inner,
              border: 'none',
              background: active ? CAPSULE_SELECTED_BG : 'transparent',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              cursor: enabled(i) ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
              transition: 'background 0.12s ease, color 0.12s ease',
              fontVariantNumeric: 'tabular-nums',
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
