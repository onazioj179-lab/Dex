// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * KeyboardShortcuts — discoverable shortcut reference.
 *
 * Hold Ctrl/Cmd for a quick peek; press Ctrl+/ (or "?") to pin it open with a
 * live search box. The catalog mirrors the bindings actually registered in the
 * shell keydown handler (AppManager) — keep the two in sync.
 *
 * Visibility: a deliberate, explicitly-invoked dialog (solid panel + light
 * scrim) — NOT a full black overlay (DEX 5.5 "zero hidden work" principle).
 */

import React, { useState, useEffect, memo, useCallback, useRef } from 'react';
import { platform } from '../utils';
import { useFocusTrap } from '../utils/useFocusTrap';
import { DexSearchInput } from '../styles/components';

interface ShortcutEntry {
  keys: string;
  label: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const MOD = platform.isMac ? '⌘' : 'Ctrl';
const OPT = platform.isMac ? '⌥' : 'Alt';
const SUPER = platform.isMac ? '⌘' : 'Win';

// Mirrors the real bindings in AppManager's keydown handler (ctrlMap/altMap +
// the explicit checks). Update both together.
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Apps',
    shortcuts: [
      { keys: `${MOD}+1`, label: 'Home' },
      { keys: `${MOD}+2`, label: 'Settings' },
      { keys: `${MOD}+3`, label: 'Files' },
      { keys: `${MOD}+4`, label: 'Notes' },
      { keys: `${MOD}+5`, label: 'Tasks' },
      { keys: `${MOD}+6`, label: 'Browser' },
      { keys: `${MOD}+7`, label: 'Gallery' },
      { keys: `${MOD}+8`, label: 'Calendar' },
      { keys: `${MOD}+9`, label: 'Kanban' },
      { keys: `${OPT}+C`, label: 'Calculator' },
      { keys: `${OPT}+T`, label: 'Transfers' },
      { keys: `${OPT}+V`, label: 'Video Editor' },
      { keys: `${OPT}+I`, label: 'Imosion' },
      { keys: `${OPT}+R`, label: 'Prism' },
      { keys: `${OPT}+F`, label: 'Flux' },
      { keys: `${OPT}+G`, label: 'Forge' },
      { keys: `${OPT}+P`, label: 'Power' },
    ],
  },
  {
    title: 'Assistant & Search',
    shortcuts: [
      { keys: `${MOD}+Space`, label: 'Open UKI assistant' },
      { keys: `${MOD}+K`, label: 'Command palette' },
      { keys: `${MOD}+/`, label: 'Toggle this list' },
    ],
  },
  {
    title: 'Windows & Layout',
    shortcuts: [
      { keys: `${MOD}+Tab`, label: 'Switch apps' },
      { keys: `${MOD}+W`, label: 'Close app' },
      { keys: `${MOD}+Shift+W`, label: 'Close all apps' },
      { keys: `${MOD}+Shift+E`, label: 'Detach / reattach window' },
      { keys: `F3`, label: 'Mission Control' },
      { keys: `${MOD}+${OPT}+←`, label: 'Tile left' },
      { keys: `${MOD}+${OPT}+→`, label: 'Tile right' },
      { keys: `${SUPER}+↑`, label: 'Maximize window' },
      { keys: `${MOD}+${OPT}+↓`, label: 'Minimize / restore' },
      { keys: `${OPT}+Shift+←`, label: 'Snap top-left' },
      { keys: `${OPT}+Shift+→`, label: 'Snap top-right' },
      { keys: `${MOD}+Shift+S`, label: 'Split screen' },
    ],
  },
  {
    title: 'Focus & Dock',
    shortcuts: [
      { keys: `${MOD}+\\`, label: 'Immersive focus' },
      { keys: `${MOD}+Shift+F`, label: 'Focus mode' },
      { keys: `${MOD}+Shift+Z`, label: 'Rewind' },
      { keys: `F11`, label: 'Cycle dock mode' },
      { keys: `${OPT}+D`, label: 'Focus dock' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: `${OPT}+←`, label: 'Back' },
      { keys: `${OPT}+→`, label: 'Forward' },
      { keys: `${MOD}+N`, label: 'New note' },
      { keys: `${MOD}+Shift+T`, label: 'Open Tasks' },
      { keys: `Esc`, label: 'Close / exit focus' },
    ],
  },
];

const ALL_COUNT = SHORTCUT_GROUPS.reduce((n, g) => n + g.shortcuts.length, 0);

/** Render a "Ctrl+Shift+W" string as individual key chips. */
const Keys: React.FC<{ value: string }> = ({ value }) => (
  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
    {value.split('+').map((k, i) => (
      <kbd
        key={i}
        style={{
          fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono, "SF Mono", monospace)',
          color: 'var(--color-text-primary)', background: 'var(--color-bg-hover)',
          padding: '2px 7px', borderRadius: 4, border: '1px solid var(--color-border)',
          minWidth: 18, textAlign: 'center', lineHeight: 1.4,
        }}
      >{k}</kbd>
    ))}
  </span>
);

const KeyboardShortcuts: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [query, setQuery] = useState('');
  // Per-user preference: whether holding Ctrl/Cmd auto-reveals this overlay.
  // Ctrl+/ and "?" always work regardless. Persisted; default on.
  const [holdReveal, setHoldReveal] = useState<boolean>(() => {
    try { return localStorage.getItem('dex-shortcuts-hold-reveal') !== 'false'; } catch { return true; }
  });
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Trap focus only when pinned (sticky) — the transient hold-Ctrl peek is
  // pointer-events:none and must not steal focus.
  const trapRef = useFocusTrap<HTMLDivElement>(sticky && visible);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearRevealTimer();
    setSticky(false);
    setVisible(false);
    setQuery('');
  }, [clearRevealTimer]);

  const openSticky = useCallback(() => {
    clearRevealTimer();
    setSticky(true);
    setVisible(true);
  }, [clearRevealTimer]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && sticky) { e.preventDefault(); close(); return; }

    // "?" opens the pinned overlay (unless typing into a field).
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const target = document.activeElement as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = !!target && (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable);
      if (!isEditable) { e.preventDefault(); openSticky(); return; }
    }

    // Ctrl+/ or Cmd+/ toggles the pinned overlay.
    if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash')) {
      e.preventDefault();
      if (sticky) { close(); } else { openSticky(); }
      return;
    }

    // Delayed reveal on holding the modifier (avoids popping during pinch-zoom).
    // Skipped when the user has turned the hold-to-reveal preference off.
    if (holdReveal && (e.key === 'Control' || e.key === 'Meta') && !sticky && !e.repeat) {
      clearRevealTimer();
      revealTimerRef.current = setTimeout(() => setVisible(true), 450);
    }
  }, [clearRevealTimer, sticky, close, openSticky, holdReveal]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    clearRevealTimer();
    if ((e.key === 'Control' || e.key === 'Meta') && !sticky) setVisible(false);
  }, [clearRevealTimer, sticky]);

  useEffect(() => {
    const cancelTransient = () => { clearRevealTimer(); if (!sticky) setVisible(false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', cancelTransient, { passive: true });
    window.addEventListener('mousedown', cancelTransient, { passive: true });
    window.addEventListener('touchstart', cancelTransient, { passive: true });
    window.addEventListener('blur', cancelTransient);
    document.addEventListener('visibilitychange', cancelTransient);
    return () => {
      clearRevealTimer();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', cancelTransient);
      window.removeEventListener('mousedown', cancelTransient);
      window.removeEventListener('touchstart', cancelTransient);
      window.removeEventListener('blur', cancelTransient);
      document.removeEventListener('visibilitychange', cancelTransient);
    };
  }, [clearRevealTimer, handleKeyDown, handleKeyUp, sticky]);

  // Focus the search box when pinned open.
  useEffect(() => {
    if (sticky && visible) {
      const t = setTimeout(() => searchRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [sticky, visible]);

  if (!visible) return null;

  const q = query.trim().toLowerCase();
  const groups = q
    ? SHORTCUT_GROUPS
        .map(g => ({ ...g, shortcuts: g.shortcuts.filter(s => s.label.toLowerCase().includes(q) || s.keys.toLowerCase().includes(q)) }))
        .filter(g => g.shortcuts.length > 0)
    : SHORTCUT_GROUPS;
  const matchCount = groups.reduce((n, g) => n + g.shortcuts.length, 0);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-max)' as React.CSSProperties['zIndex'],
        background: 'var(--color-scrim, rgba(0,0,0,0.45))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.14s ease', padding: 'var(--space-6)',
        pointerEvents: sticky ? 'auto' : 'none',
      }}
      onClick={() => { if (sticky) close(); }}
    >
      <div
        ref={trapRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-elevated, var(--color-bg-secondary))',
          border: '1px solid var(--color-border)', borderRadius: 10,
          padding: 'var(--space-6)', width: 'min(880px, 96vw)', maxHeight: '82vh',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
            Keyboard Shortcuts
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {q ? `${matchCount} of ${ALL_COUNT}` : `${ALL_COUNT} shortcuts`}
          </span>
        </div>

        {sticky && (
          <DexSearchInput
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onClear={() => setQuery('')}
            placeholder="Search"
            aria-label="Search keyboard shortcuts"
            fullWidth
          />
        )}

        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {matchCount === 0 ? (
            <div style={{ padding: 'var(--space-8) 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              No shortcuts match “{query}”.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))', gap: 'var(--space-5) 28px' }}>
              {groups.map(group => (
                <div key={group.title}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
                  }}>
                    {group.title}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {group.shortcuts.map(s => (
                      <div key={s.keys + s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                        <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{s.label}</span>
                        <Keys value={s.keys} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {sticky && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={holdReveal}
                onChange={e => {
                  const v = e.target.checked;
                  setHoldReveal(v);
                  try { localStorage.setItem('dex-shortcuts-hold-reveal', String(v)); } catch { /* quota */ }
                }}
                aria-label="Show this overlay when holding Ctrl"
              />
              Show on holding Ctrl
            </label>
            <span>
              Press <kbd style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)' }}>Esc</kbd> to close
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

KeyboardShortcuts.displayName = 'KeyboardShortcuts';
export default memo(KeyboardShortcuts);
