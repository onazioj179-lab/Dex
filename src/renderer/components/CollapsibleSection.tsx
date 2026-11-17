// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CollapsibleSection — the shared "fold a block of content" primitive.
 *
 * DEX had a toolbar collapser (CollapsibleToolGroup) and a side-rail collapser
 * (CollapsibleSidePanel) but nothing for the most common case: a labelled
 * section of a dense screen that the user can fold away. This is that piece,
 * extracted from the Control Center redesign so every dense app/panel folds the
 * same way (same header, same chevron, same solid surface).
 *
 * Two modes:
 *   - Drop-in / self-persisting: pass `storageKey` and it remembers its own
 *     collapsed state in localStorage — zero plumbing at the call site.
 *   - Controlled: pass `collapsed` + `onToggle` when the parent owns the state
 *     (e.g. a panel that persists many sections together).
 *
 * Solid, no-glass, matches the OS-wide consistent surface.
 */

import React, { useCallback, useState } from 'react';

export interface CollapsibleSectionProps {
  /** Section title shown in the header. */
  label: string;
  /** Optional leading icon element. */
  icon?: React.ReactNode;
  /** Section body — only mounted when expanded. */
  children: React.ReactNode;
  /** Controlled collapsed state. Provide with `onToggle` for parent-owned state. */
  collapsed?: boolean;
  /** Called when the header is activated (controlled mode). */
  onToggle?: () => void;
  /** Initial collapsed state for uncontrolled/self-persisting mode. */
  defaultCollapsed?: boolean;
  /** localStorage key for self-persisting collapse (uncontrolled mode). */
  storageKey?: string;
  /** Extra style merged onto the section container. */
  style?: React.CSSProperties;
  /** Right-aligned header accessory (e.g. a count badge), before the chevron. */
  headerAccessory?: React.ReactNode;
}

const surface: React.CSSProperties = {
  // Longhands only — never mix the `background`/`border` shorthands with a
  // longhand override or React drops the longhand (see the CC redesign notes).
  backgroundColor: 'var(--color-bg-surface, rgba(255,255,255,0.04))',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--color-border-subtle)',
  borderRadius: 'var(--radius-lg, 12px)',
  padding: 'var(--space-3, 12px)',
  minWidth: 0,
};

const headerLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  textTransform: 'none',
  color: 'var(--color-text-tertiary)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

function readStored(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* sandbox */ }
  return fallback;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  label,
  icon,
  children,
  collapsed,
  onToggle,
  defaultCollapsed = false,
  storageKey,
  style,
  headerAccessory,
}) => {
  const controlled = collapsed !== undefined;
  const [internal, setInternal] = useState<boolean>(() =>
    storageKey ? readStored(storageKey, defaultCollapsed) : defaultCollapsed);

  const isCollapsed = controlled ? (collapsed as boolean) : internal;

  const handleToggle = useCallback(() => {
    if (controlled) { onToggle?.(); return; }
    setInternal((prev) => {
      const next = !prev;
      if (storageKey) { try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* quota */ } }
      return next;
    });
  }, [controlled, onToggle, storageKey]);

  return (
    <div style={{ ...surface, ...style }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={!isCollapsed}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'inherit',
        }}
      >
        <span style={headerLabel}>{icon}{label}</span>
        {headerAccessory}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ marginLeft: headerAccessory ? 6 : 'auto', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.16s ease' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>{children}</div>
      )}
    </div>
  );
};

export default CollapsibleSection;
