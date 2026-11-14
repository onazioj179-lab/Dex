// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * MiniShell — compact, always-on-top mode (WS5). When compact mode is on, the
 * App root renders this instead of the full shell: a small pill showing the
 * active app plus quick actions, while the underlying apps keep running in the
 * background. The OS window is shrunk and pinned on top by the main process
 * (window:enter-compact); expanding restores the prior bounds.
 *
 * Single-window morph — no second BrowserWindow — so renderer state is shared
 * and the design ports cleanly to the future dex-os shell.
 */

import React, { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { useCurrentAppId, APP_DEFINITIONS } from '../store/runningApps';
import { cssTransitions } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// Store — a tiny shell flag so any surface can toggle compact mode.
// ---------------------------------------------------------------------------

interface CompactModeState {
  compact: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

const COMPACT_WIDTH = 380;
const COMPACT_HEIGHT = 96;

// Native compact window (src-tauri/src/compact_window.rs): resizes the shell
// to a small always-on-top panel and restores the previous bounds on exit.
const win = () => {
  const dex = (window as unknown as { dex?: { invoke?: (ch: string, ...a: unknown[]) => Promise<unknown> } }).dex;
  if (!dex?.invoke) return null;
  return {
    enterCompact: (o?: object) => dex.invoke!('window:enterCompact', o),
    exitCompact: () => dex.invoke!('window:exitCompact'),
  };
};

export const useCompactMode = create<CompactModeState>((set, get) => ({
  compact: false,
  enter: () => {
    if (get().compact) return;
    set({ compact: true });
    document.documentElement.setAttribute('data-compact', 'true');
    win()?.enterCompact?.({ width: COMPACT_WIDTH, height: COMPACT_HEIGHT, corner: 'bottom-right' })
      ?.catch(() => { /* main unavailable — renderer flag still flips for dev */ });
  },
  exit: () => {
    if (!get().compact) return;
    set({ compact: false });
    document.documentElement.removeAttribute('data-compact');
    win()?.exitCompact?.()?.catch(() => { /* ignore */ });
  },
  toggle: () => (get().compact ? get().exit() : get().enter()),
}));

/** Global Ctrl+Shift+M toggle. Mount once near the app root. */
export function useCompactModeShortcut(): void {
  const toggle = useCompactMode(s => s.toggle);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
}

const iconStroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const MiniShell: React.FC = () => {
  const exit = useCompactMode(s => s.exit);
  const currentAppId = useCurrentAppId();
  const def = APP_DEFINITIONS[currentAppId] || { name: 'Home', color: 'var(--color-accent)', icon: '' };

  // Quick actions expand back to the full window first (the compact pill is too
  // small to host an app or overlay), then perform — so every button does
  // something real instead of acting on a 380x96 surface.
  const expandThen = useCallback((name: string, detail?: unknown) => {
    exit();
    setTimeout(() => window.dispatchEvent(new CustomEvent(name, { detail })), 60);
  }, [exit]);

  const actions: QuickAction[] = [
    {
      id: 'notes',
      label: 'Open Notes',
      icon: <svg width={16} height={16} viewBox="0 0 24 24" {...iconStroke}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>,
      run: () => expandThen('dex-open-app', { appId: 'notes' }),
    },
    {
      id: 'timer',
      label: 'Open Timer',
      icon: <svg width={16} height={16} viewBox="0 0 24 24" {...iconStroke}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M9 2h6" /></svg>,
      run: () => expandThen('dex-open-app', { appId: 'timer' }),
    },
    {
      id: 'clipboard',
      label: 'Clipboard history',
      icon: <svg width={16} height={16} viewBox="0 0 24 24" {...iconStroke}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>,
      run: () => expandThen('dex-open-clipboard'),
    },
  ];

  return (
    <div style={styles.root}>
      <div style={styles.dragRegion} aria-hidden="true" />
      <div style={styles.identity}>
        <span style={{ ...styles.appDot, background: def.color }} />
        <div style={styles.idText}>
          <span style={styles.appName}>{def.name}</span>
          <span style={styles.subtitle}>DEX · compact</span>
        </div>
      </div>

      <div style={styles.actions} className="dex-no-drag">
        {actions.map(a => (
          <button
            key={a.id}
            type="button"
            title={a.label}
            aria-label={a.label}
            className="mini-action"
            style={styles.actionBtn}
            onClick={a.run}
          >
            {a.icon}
          </button>
        ))}
        <div style={styles.divider} />
        <button
          type="button"
          title="Expand DEX (Ctrl+Shift+M)"
          aria-label="Expand DEX to full window"
          className="mini-action mini-expand"
          style={styles.actionBtn}
          onClick={exit}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" {...iconStroke}>
            <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </svg>
        </button>
      </div>

      <style>{miniCss}</style>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: '0 14px',
    background: 'var(--color-bg-surface, #161618)',
    borderRadius: 'var(--radius-xl, 8px)',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.10))',
    boxShadow: 'var(--pg-shadow-modal)',
    fontFamily: 'var(--dex-font-ui, system-ui)',
    overflow: 'hidden',
    WebkitAppRegion: 'drag',
  } as React.CSSProperties,
  dragRegion: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  identity: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, zIndex: 1 },
  appDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  idText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  appName: { fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  subtitle: { fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.02em' },
  actions: { display: 'flex', alignItems: 'center', gap: 4, zIndex: 1 } as React.CSSProperties,
  actionBtn: {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-md, 4px)',
    color: 'var(--color-text-secondary)', cursor: 'pointer',
  },
  divider: { width: 1, height: 18, background: 'var(--color-border-subtle, rgba(255,255,255,0.10))', margin: '0 2px' },
};

const miniCss = `
  [data-compact] .mini-action { transition: ${cssTransitions(['background', 'color', 'transform'], 'micro')}; }
  [data-compact] .mini-action:hover { background: var(--color-bg-hover, rgba(255,255,255,0.08)); color: var(--color-text-primary); }
  [data-compact] .mini-action:active { transform: scale(0.92); }
`;

export default MiniShell;
