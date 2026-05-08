// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * KeyboardShortcuts — Hold-to-reveal overlay showing all shortcuts
 *
 * Press and hold Ctrl (or Cmd) to reveal an overlay with all keyboard
 * shortcuts grouped by category. Tap Ctrl+/ to toggle sticky mode.
 */

import React, { useState, useEffect, memo, useCallback, useRef } from 'react';

interface ShortcutEntry {
  keys: string;
  label: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Ctrl+1', label: 'Home' },
      { keys: 'Ctrl+2', label: 'Settings' },
      { keys: 'Ctrl+3', label: 'Files' },
      { keys: 'Ctrl+4', label: 'Notes' },
      { keys: 'Ctrl+5', label: 'Tasks' },
      { keys: 'Ctrl+6', label: 'Browser' },
      { keys: 'Ctrl+7', label: 'Gallery' },
      { keys: 'Ctrl+8', label: 'Calendar' },
      { keys: 'Ctrl+9', label: 'Kanban' },
    ],
  },
  {
    title: 'Creative Suite',
    shortcuts: [
      { keys: 'Alt+V', label: 'VINX' },
      { keys: 'Alt+I', label: 'Imosion' },
      { keys: 'Alt+R', label: 'PRISM' },
      { keys: 'Alt+F', label: 'FLUX' },
      { keys: 'Alt+G', label: 'FORGE' },
      { keys: 'Alt+X', label: 'AXL' },
      { keys: 'Alt+W', label: 'Rewind' },
    ],
  },
  {
    title: 'System',
    shortcuts: [
      { keys: 'Ctrl+K', label: 'Command Palette' },
      { keys: 'Ctrl+L', label: 'Lock Screen' },
      { keys: 'Ctrl+,', label: 'Quick Settings' },
      { keys: 'Alt+T', label: 'Transfers' },
      { keys: 'Alt+P', label: 'Power' },
      { keys: 'Alt+C', label: 'Calculator' },
      { keys: 'F11', label: 'Fullscreen' },
      { keys: 'Ctrl+/', label: 'Toggle Shortcuts' },
    ],
  },
];

const KeyboardShortcuts: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [sticky, setSticky] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Escape closes a sticky overlay
    if (e.key === 'Escape' && sticky) {
      e.preventDefault();
      clearRevealTimer();
      setSticky(false);
      setVisible(false);
      return;
    }

    // "?" opens the sticky overlay (when not typing in an input)
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const target = document.activeElement as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = !!target && (
        tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
      );
      if (!isEditable) {
        e.preventDefault();
        clearRevealTimer();
        setSticky(true);
        setVisible(true);
        return;
      }
    }

    // Ctrl+/ toggles sticky mode
    if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash')) {
      e.preventDefault();
      clearRevealTimer();
      setSticky(prev => !prev);
      setVisible(prev => !prev);
      return;
    }

    // Delayed reveal prevents accidental popup during trackpad pinch-zoom
    if ((e.key === 'Control' || e.key === 'Meta') && !sticky && !e.repeat) {
      clearRevealTimer();
      revealTimerRef.current = setTimeout(() => {
        setVisible(true);
      }, 450);
    }
  }, [clearRevealTimer, sticky]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    clearRevealTimer();
    if ((e.key === 'Control' || e.key === 'Meta') && !sticky) {
      setVisible(false);
    }
  }, [clearRevealTimer, sticky]);

  useEffect(() => {
    const cancelTransientReveal = () => {
      clearRevealTimer();
      if (!sticky) setVisible(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', cancelTransientReveal, { passive: true });
    window.addEventListener('mousedown', cancelTransientReveal, { passive: true });
    window.addEventListener('touchstart', cancelTransientReveal, { passive: true });
    window.addEventListener('blur', cancelTransientReveal);
    document.addEventListener('visibilitychange', cancelTransientReveal);

    return () => {
      clearRevealTimer();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', cancelTransientReveal);
      window.removeEventListener('mousedown', cancelTransientReveal);
      window.removeEventListener('touchstart', cancelTransientReveal);
      window.removeEventListener('blur', cancelTransientReveal);
      document.removeEventListener('visibilitychange', cancelTransientReveal);
    };
  }, [clearRevealTimer, handleKeyDown, handleKeyUp, sticky]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-max)',
        background: 'rgba(0,0,0,0.80)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
        pointerEvents: sticky ? 'auto' : 'none',
      }}
      onClick={() => { if (sticky) { setSticky(false); setVisible(false); } }}
    >
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${SHORTCUT_GROUPS.length}, 1fr)`,
        gap: 32, maxWidth: 720, padding: 40,
      }}>
        {SHORTCUT_GROUPS.map(group => (
          <div key={group.title}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14,
            }}>
              {group.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.shortcuts.map(s => (
                <div key={s.keys} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>{s.label}</span>
                  <kbd style={{
                    fontSize: 11, fontWeight: 600, fontFamily: '"SF Mono", monospace',
                    color: '#fff', background: 'var(--color-border)',
                    padding: '3px 8px', borderRadius: 5,
                    border: '1px solid var(--color-border)',
                    whiteSpace: 'nowrap',
                  }}>{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {sticky && (
        <div style={{
          position: 'absolute', bottom: 30,
          fontSize: 11, color: 'var(--color-text-tertiary)',
        }}>
          Click anywhere or press <kbd style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
            background: 'var(--color-border)', border: '1px solid var(--color-border)',
          }}>Ctrl+/</kbd> to close
        </div>
      )}
    </div>
  );
};

KeyboardShortcuts.displayName = 'KeyboardShortcuts';
export default memo(KeyboardShortcuts);
