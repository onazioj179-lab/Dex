// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CollapsibleSidePanel -- a standardized left/right side panel for creative apps
 * that can collapse to a thin rail and expand back. State persists per id in
 * localStorage so a panel stays the way the user left it across sessions.
 *
 * Pairs with ResizablePanel for width dragging; this only owns the collapse
 * affordance and header. No glass (creative suite is no-glass).
 */

import React, { useCallback, useState } from 'react';

export interface CollapsibleSidePanelProps {
  /** Stable id for persistence, e.g. "vinx-inspector". */
  id: string;
  title: string;
  /** Which edge the panel sits on; controls collapse-arrow direction. */
  side?: 'left' | 'right';
  /** Expanded width in px. */
  width?: number;
  /** Width of the collapsed rail. */
  railWidth?: number;
  defaultCollapsed?: boolean;
  accent?: string;
  /** Optional header actions (buttons) shown when expanded. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  onToggle?: (collapsed: boolean) => void;
}

const railBtnStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)',
  cursor: 'pointer', fontSize: 12, padding: 4, borderRadius: 4, lineHeight: 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

export const CollapsibleSidePanel: React.FC<CollapsibleSidePanelProps> = ({
  id, title, side = 'left', width = 240, railWidth = 32,
  defaultCollapsed = false, accent = 'var(--color-accent)', actions, children, style, onToggle,
}) => {
  const storageKey = `dex-sidepanel-${id}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v == null ? defaultCollapsed : v === '1';
    } catch { return defaultCollapsed; }
  });

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* ignore */ }
      onToggle?.(next);
      return next;
    });
  }, [storageKey, onToggle]);

  const collapseGlyph = side === 'left' ? '‹' : '›';
  const expandGlyph = side === 'left' ? '›' : '‹';

  if (collapsed) {
    return (
      <div
        style={{
          width: railWidth, flexShrink: 0, height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '6px 0',
          background: 'var(--color-bg-surface)',
          [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--color-border-subtle)',
          ...style,
        }}
      >
        <button type="button" title={`Expand ${title}`} aria-label={`Expand ${title}`} onClick={toggle}
          style={{ ...railBtnStyle, color: accent }}>{expandGlyph}</button>
        <span
          style={{
            writingMode: 'vertical-rl', textOrientation: 'mixed',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)', transform: side === 'right' ? 'rotate(180deg)' : undefined,
            cursor: 'pointer',
          }}
          onClick={toggle}
        >{title}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        width, flexShrink: 0, height: '100%', minHeight: 0,
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg-surface)',
        [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--color-border-subtle)',
        ...style,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 28, flexShrink: 0,
        padding: '0 6px', borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        {side === 'left' && (
          <button type="button" title={`Collapse ${title}`} aria-label={`Collapse ${title}`} onClick={toggle} style={railBtnStyle}>{collapseGlyph}</button>
        )}
        <span style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        {actions}
        {side === 'right' && (
          <button type="button" title={`Collapse ${title}`} aria-label={`Collapse ${title}`} onClick={toggle} style={railBtnStyle}>{collapseGlyph}</button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>
  );
};

export default CollapsibleSidePanel;
