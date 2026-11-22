// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX Capsule kit: the shared floating-control pieces (geometry from
// capsuleTokens.ts, so heights, radii and highlights line up across apps).
//
//   DexCapsuleGroup      floating toolbar container (frosted, or opaque in pro apps)
//   DexCapsuleButton     icon and/or label button, same height/radius as segments
//   DexFloatingSearch    rounded search field with clear + Escape
//   DexDisclosureGroup   collapsible group header for dense lists (count, keyboard, remembered)
//
// Capsules are for short actions, navigation, search and filters; tables, code,
// documents and datasets stay on ordinary surfaces.

import React, { useCallback, useState } from 'react';
import {
  CAPSULE_HEIGHT, CAPSULE_INSET, CAPSULE_FONT, CAPSULE_ICON, CAPSULE_PAD_X, CAPSULE_STROKE,
  capsuleRadii, CAPSULE_SELECTED_BG, CAPSULE_HOVER_BG, type CapsuleSize,
} from './capsuleTokens';

// ---- Group / toolbar --------------------------------------------------------

export interface DexCapsuleGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: CapsuleSize;
  /** 'frosted' (shell/everyday apps) or 'opaque' (creative/pro apps stay no-glass). */
  material?: 'frosted' | 'opaque';
  /** Accessible name; the group is a toolbar. */
  label: string;
}

export const DexCapsuleGroup: React.FC<DexCapsuleGroupProps> = ({ size = 'md', material = 'frosted', label, style, children, ...rest }) => {
  const { outer } = capsuleRadii(size);
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-dex-capsule="group"
      className={material === 'frosted' ? 'dex-mat-frosted' : 'dex-mat-opaque'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: CAPSULE_INSET,
        borderRadius: outer + CAPSULE_INSET, minHeight: CAPSULE_HEIGHT[size] + CAPSULE_INSET * 2, boxSizing: 'border-box',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

/** A thin divider between clusters inside a group. */
export const DexCapsuleDivider: React.FC = () => (
  <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '4px 3px', background: 'var(--color-border-subtle)' }} />
);

// ---- Button -------------------------------------------------------------------

export interface DexCapsuleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: CapsuleSize;
  icon?: React.ReactNode;
  /** Selected / on state (toggle buttons): accent tint, aria-pressed. */
  active?: boolean;
  /** Tinted primary action. */
  primary?: boolean;
}

export const DexCapsuleButton = React.forwardRef<HTMLButtonElement, DexCapsuleButtonProps>(function DexCapsuleButton(
  { size = 'md', icon, active, primary, children, style, disabled, onMouseEnter, onMouseLeave, ...rest }, ref,
) {
  const h = CAPSULE_HEIGHT[size] - CAPSULE_INSET * 2;
  const iconOnly = !children;
  const bg = primary ? 'var(--color-accent, #0A84FF)' : active ? CAPSULE_SELECTED_BG : 'transparent';
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      data-dex-capsule="button"
      onMouseEnter={(e) => { if (!active && !primary && !disabled) e.currentTarget.style.background = CAPSULE_HOVER_BG; onMouseEnter?.(e); }}
      onMouseLeave={(e) => { e.currentTarget.style.background = bg; onMouseLeave?.(e); }}
      style={{
        height: h, minWidth: h, padding: iconOnly ? 0 : `0 ${CAPSULE_PAD_X[size]}px`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: capsuleRadii(size).inner, border: 'none', background: bg,
        color: primary ? '#fff' : active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        fontSize: CAPSULE_FONT[size], fontWeight: primary || active ? 600 : 500, lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap',
        transition: 'background 0.12s ease, color 0.12s ease',
        ...style,
      }}
      {...rest}
    >
      {icon && <span aria-hidden="true" style={{ display: 'inline-flex', width: CAPSULE_ICON[size], height: CAPSULE_ICON[size] }}>{icon}</span>}
      {children}
    </button>
  );
});

/** One stroke-weight glyph helper so capsule icons match. */
export const CapsuleGlyph: React.FC<{ size?: CapsuleSize; children: React.ReactNode }> = ({ size = 'md', children }) => (
  <svg width={CAPSULE_ICON[size]} height={CAPSULE_ICON[size]} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={CAPSULE_STROKE * (24 / CAPSULE_ICON[size])} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

// ---- Floating search ----------------------------------------------------------

export interface DexFloatingSearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  size?: CapsuleSize;
  width?: number | string;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export const DexFloatingSearch: React.FC<DexFloatingSearchProps> = ({ value, onChange, placeholder, label, size = 'md', width = 220, inputRef, onKeyDown }) => {
  const h = CAPSULE_HEIGHT[size];
  return (
    <div data-dex-capsule="search" role="search" style={{
      position: 'relative', display: 'inline-flex', alignItems: 'center', width, height: h,
      borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-inset)',
      border: '1px solid var(--color-border-subtle)', boxSizing: 'border-box',
    }}>
      <span aria-hidden="true" style={{ position: 'absolute', left: CAPSULE_PAD_X[size], display: 'inline-flex', color: 'var(--color-text-tertiary)' }}>
        <CapsuleGlyph size={size}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></CapsuleGlyph>
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); onChange(''); } onKeyDown?.(e); }}
        style={{
          flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none', background: 'transparent',
          color: 'var(--color-text-primary)', fontSize: CAPSULE_FONT[size] + 1,
          padding: `0 ${value ? h : CAPSULE_PAD_X[size]}px 0 ${CAPSULE_PAD_X[size] + CAPSULE_ICON[size] + 6}px`,
        }}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} style={{
          position: 'absolute', right: 3, width: h - 6, height: h - 6, borderRadius: (h - 6) / 2, border: 'none',
          background: CAPSULE_HOVER_BG, color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}>
          <CapsuleGlyph size="sm"><path d="M18 6L6 18M6 6l12 12" /></CapsuleGlyph>
        </button>
      )}
    </div>
  );
};

// ---- Disclosure group (dense lists) -----------------------------------------------

export interface DexDisclosureGroupProps {
  title: string;
  count?: number;
  /** Remember open/closed under this key. */
  storageKey?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const readOpen = (key: string | undefined, fallback: boolean): boolean => {
  if (!key) return fallback;
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; }
};

export const DexDisclosureGroup: React.FC<DexDisclosureGroupProps> = ({ title, count, storageKey, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));
  const id = React.useId();
  const toggle = useCallback(() => {
    setOpen((o) => {
      const n = !o;
      if (storageKey) { try { localStorage.setItem(storageKey, n ? '1' : '0'); } catch { /* storage blocked */ } }
      return n;
    });
  }, [storageKey]);
  return (
    <div data-dex-capsule="disclosure">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: 28, padding: '0 8px', border: 'none',
          background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
          borderRadius: 6,
        }}
      >
        <span aria-hidden="true" style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
          <CapsuleGlyph size="sm"><path d="M9 6l6 6-6 6" /></CapsuleGlyph>
        </span>
        <span>{title}</span>
        {typeof count === 'number' && <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
      </button>
      <div id={id} hidden={!open}>{open ? children : null}</div>
    </div>
  );
};
