/**
 * DEX Platform
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Created by Onazi Treasure OJ <onazi75@gmail.com>
 * Licensed under the DEX Software License Agreement v1.0. See LICENSE.
 */
import React, { useEffect, useId, useRef, useState } from 'react';

interface WorkspacePanelProps {
  storageKey: string;
  title: string;
  side?: 'left' | 'right';
  initialWidth?: number;
  hidden?: boolean;
  children: React.ReactNode;
}

/** A persistent tool panel; dragging accounts for spatial desktop scaling. */
export function WorkspacePanel({ storageKey, title, side = 'left', initialWidth = 220, hidden = false, children }: WorkspacePanelProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const [state, setState] = useState(() => {
    const fallback = { width: initialWidth, collapsed: false };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      return saved && Number.isFinite(saved.width) && typeof saved.collapsed === 'boolean'
        ? { width: Math.min(400, Math.max(160, saved.width)), collapsed: saved.collapsed } : fallback;
    } catch { return fallback; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Layout remains usable without storage. */ }
  }, [state, storageKey]);
  useEffect(() => () => cleanup.current?.(), []);

  const resize = (width: number) => setState(s => ({ ...s, width: Math.min(400, Math.max(160, width)) }));
  const startResize = (event: React.PointerEvent) => {
    if (event.button !== 0 || !panel.current) return;
    event.preventDefault();
    cleanup.current?.();
    const start = event.clientX;
    const width = state.width;
    const scale = panel.current.getBoundingClientRect().width / panel.current.offsetWidth || 1;
    const pointerId = event.pointerId;
    const move = (e: PointerEvent) => {
      if (e.pointerId === pointerId) resize(width + (e.clientX - start) / scale * (side === 'left' ? 1 : -1));
    };
    const stop = (e?: PointerEvent) => {
      if (e && e.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      cleanup.current = null;
    };
    cleanup.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  return <div ref={panel} style={{
    position: 'relative', display: hidden ? 'none' : 'flex', flexDirection: 'column', flexShrink: 0,
    width: state.collapsed ? 36 : state.width, minHeight: 0,
    background: 'var(--color-bg-elevated, #1C1C1E)',
    borderInlineStart: side === 'right' ? '1px solid var(--color-border-subtle, #38383A)' : undefined,
    borderInlineEnd: side === 'left' ? '1px solid var(--color-border-subtle, #38383A)' : undefined,
  }}>
    <button type="button" aria-expanded={!state.collapsed} aria-controls={id}
      aria-label={`${state.collapsed ? 'Show' : 'Hide'} ${title}`}
      onClick={() => setState(s => ({ ...s, collapsed: !s.collapsed }))}
      style={{ minHeight: 36, border: 0, background: 'transparent', color: 'var(--color-text-primary, #F5F5F7)', cursor: 'pointer', textAlign: 'start', padding: 8 }}>
      {state.collapsed ? (side === 'left' ? '›' : '‹') : `${side === 'left' ? '‹' : '›'} ${title}`}
    </button>
    <div id={id} hidden={state.collapsed} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    {!state.collapsed && <div role="separator" aria-label={`Resize ${title}`} aria-orientation="vertical"
      aria-valuemin={160} aria-valuemax={400} aria-valuenow={state.width} aria-controls={id} tabIndex={0}
      onPointerDown={startResize}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        resize(event.key === 'Home' ? 160 : event.key === 'End' ? 400
          : state.width + (event.key === 'ArrowRight' ? 10 : -10) * (side === 'left' ? 1 : -1));
      }}
      style={{ position: 'absolute', top: 36, bottom: 0, width: 6, [side === 'left' ? 'right' : 'left']: -3,
        cursor: 'col-resize', touchAction: 'none', zIndex: 2 }} />}
  </div>;
}
