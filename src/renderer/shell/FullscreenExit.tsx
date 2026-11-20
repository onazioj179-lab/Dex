// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Native fullscreen: one toggle, a known state, and a way out.
 *
 * Fullscreen (F11 / Command Palette) used to leave no visible exit: you had to
 * know F11. Now, while the DEX window is fullscreen:
 *   - a small "Exit full screen" capsule shows for a moment on entering, and
 *     again whenever the pointer reaches the top edge;
 *   - Esc exits (unless a dialog or menu is open, or you are typing).
 * The state is read from the native window (window:isFullscreen) and
 * re-checked on every resize, so Win+Up, the window menu etc. stay in sync.
 * Leaving fullscreen restores the previous geometry natively (re-maximizes
 * when it was maximized).
 */

import React, { useEffect, useRef, useState } from 'react';

type Invoke = (channel: string, ...args: unknown[]) => Promise<any>;
const invoke = (): Invoke | null => {
  const f = (globalThis as { dex?: { invoke?: Invoke } }).dex?.invoke;
  return typeof f === 'function' ? f : null;
};

export const FULLSCREEN_CHANGED = 'dex-fullscreen-changed';

/** Toggle real window fullscreen (DOM fullscreen in the web preview). */
export async function toggleWindowFullscreen(): Promise<void> {
  const inv = invoke();
  if (inv) {
    const r = await inv('window:toggleFullscreen').catch(() => null);
    window.dispatchEvent(new CustomEvent(FULLSCREEN_CHANGED, { detail: { fullscreen: !!r?.fullscreen } }));
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  else await document.documentElement.requestFullscreen?.().catch(() => {});
}

async function readFullscreen(): Promise<boolean> {
  const inv = invoke();
  if (inv) { const r = await inv('window:isFullscreen').catch(() => null); return !!r?.fullscreen; }
  return !!document.fullscreenElement;
}

/** True when Esc belongs to something else (a dialog, a menu, a text field). */
function escTaken(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return true;
  return !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]');
}

export const FullscreenExit: React.FC = () => {
  const [full, setFull] = useState(false);
  const [shown, setShown] = useState(false);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (ms: number) => {
    setShown(true);
    if (hideRef.current) clearTimeout(hideRef.current);
    hideRef.current = setTimeout(() => setShown(false), ms);
  };

  useEffect(() => {
    let alive = true;
    const sync = () => { void readFullscreen().then((f) => { if (alive) setFull(f); }); };
    const onChanged = (e: Event) => {
      const f = !!(e as CustomEvent).detail?.fullscreen;
      setFull(f);
      if (f) flash(2600); else setShown(false);
    };
    sync();
    window.addEventListener('resize', sync);
    document.addEventListener('fullscreenchange', sync);
    window.addEventListener(FULLSCREEN_CHANGED, onChanged);
    return () => {
      alive = false;
      window.removeEventListener('resize', sync);
      document.removeEventListener('fullscreenchange', sync);
      window.removeEventListener(FULLSCREEN_CHANGED, onChanged);
      if (hideRef.current) clearTimeout(hideRef.current);
    };
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || escTaken(e)) return;
      e.preventDefault();
      void toggleWindowFullscreen();
    };
    const onMove = (e: PointerEvent) => { if (e.clientY <= 4) flash(2200); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointermove', onMove); };
  }, [full]);

  if (!full) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 10, left: '50%', zIndex: 'var(--z-max)' as React.CSSProperties['zIndex'],
        transform: `translate(-50%, ${shown ? 0 : -48}px)`, opacity: shown ? 1 : 0,
        transition: 'transform 180ms ease, opacity 180ms ease', pointerEvents: shown ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 6px 14px', borderRadius: 9999,
        background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)',
        fontSize: 12, color: 'var(--color-text-secondary)',
      }}
      onPointerEnter={() => { if (hideRef.current) clearTimeout(hideRef.current); setShown(true); }}
      onPointerLeave={() => flash(1200)}
    >
      <span>Full screen · Esc or F11 to exit</span>
      <button
        onClick={() => { void toggleWindowFullscreen(); }}
        style={{ height: 26, padding: '0 12px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'var(--color-accent-fill)', color: 'var(--color-accent-text, #fff)' }}
      >Exit full screen</button>
    </div>
  );
};

export default FullscreenExit;
