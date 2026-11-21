// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Stage Manager (App Overview / Exposé)
 * Zoom out to see every running app as its LIVE window, scaled down in a
 * grid — real content, exact aspect ratio, not a snapshot. Click a window
 * to zoom it back to the front. Home stays behind as the dimmed stage.
 *
 * The live previews are the actual app containers (AppManager keeps every
 * running app mounted). We fly them into grid slots with GPU transforms set
 * as inline `!important` — same trick as the window-drag path — so the
 * low-perf-tier `transform: none !important` hover rule can't wipe them.
 * On exit we restore each container's exact inline style and re-assert
 * visibility from `data-app-state`, which React owns.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import DexIcon from '../components/DexIcon';
import { isReduceMotion } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface OverviewApp {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  minimized?: boolean;
  /** The app's live container element (null when not kept alive / detached) */
  element?: HTMLElement | null;
}

interface AppOverviewProps {
  visible: boolean;
  apps: OverviewApp[];
  activeAppId: string;
  onSelectApp: (id: string) => void;
  onCloseApp: (id: string) => void;
  onDismiss: () => void;
}

/** Fitted on-screen rect of a staged window (for overlay hit targets) */
interface StageRect { x: number; y: number; w: number; h: number; live: boolean }

// ---------------------------------------------------------------------------
// GRID LAYOUT
// ---------------------------------------------------------------------------

const MARGIN = { top: 74, bottom: 52, left: 36, right: 36 };
const GAP = 18;
const LABEL_H = 26;
const EXIT_MS = 240;

function computeSlots(n: number, W: number, H: number): { x: number; y: number; w: number; h: number }[] {
  if (n === 0) return [];
  const cols = n <= 9 ? Math.ceil(Math.sqrt(n)) : Math.max(4, Math.ceil(Math.sqrt(n * W / H)));
  const rows = Math.ceil(n / cols);
  const availW = W - MARGIN.left - MARGIN.right;
  const availH = H - MARGIN.top - MARGIN.bottom;
  const slotW = (availW - GAP * (cols - 1)) / cols;
  const slotH = (availH - GAP * (rows - 1)) / rows - LABEL_H;
  const slots: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    // Center a partial last row
    const rowW = inRow * slotW + (inRow - 1) * GAP;
    const startX = MARGIN.left + (availW - rowW) / 2;
    const col = i - row * cols;
    slots.push({
      x: startX + col * (slotW + GAP),
      y: MARGIN.top + row * (slotH + LABEL_H + GAP),
      w: slotW,
      h: slotH,
    });
  }
  return slots;
}

/** Restore React-owned visibility after we've mutated inline styles. */
function reassertAppVisibility(el: HTMLElement): void {
  const state = el.getAttribute('data-app-state');
  const fg = state === 'foreground';
  el.style.opacity = fg ? '1' : '0';
  el.style.pointerEvents = fg ? 'auto' : 'none';
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export const AppOverview: React.FC<AppOverviewProps> = ({
  visible,
  apps,
  activeAppId,
  onSelectApp,
  onCloseApp,
  onDismiss,
}) => {
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<Map<string, StageRect>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef(apps);
  appsRef.current = apps;
  const closingRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  const stageApps = apps.filter(a => a.id !== 'home');
  const idsKey = stageApps.map(a => a.id).join(',');
  const query = search.trim().toLowerCase();

  // Reset only when the stage closes. These resets used to sit in effects that
  // re-run on every window-list change and every parent render while hidden,
  // which chained into "Maximum update depth exceeded" when many apps launched.
  useEffect(() => {
    if (visible) return;
    setLayout(prev => (prev.size === 0 ? prev : new Map()));
    setSearch('');
  }, [visible]);

  // -- Fly live windows into the grid ---------------------------------------
  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    const reduce = isReduceMotion();
    const current = appsRef.current.filter(a => a.id !== 'home');
    const slots = computeSlots(current.length, window.innerWidth, window.innerHeight);
    const saved = new Map<HTMLElement, string>();
    const next = new Map<string, StageRect>();

    current.forEach((app, i) => {
      const slot = slots[i];
      const el = app.element;
      if (!el || app.minimized) {
        // Not kept alive (or detached): overlay renders an icon card instead
        next.set(app.id, { ...slot, live: false });
        return;
      }
      saved.set(el, el.style.cssText);
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        next.set(app.id, { ...slot, live: false });
        saved.delete(el);
        return;
      }
      const s = Math.min(slot.w / rect.width, slot.h / rect.height);
      const w = rect.width * s;
      const h = rect.height * s;
      const x = slot.x + (slot.w - w) / 2;
      const y = slot.y + (slot.h - h) / 2;
      next.set(app.id, { x, y, w, h, live: true });

      el.style.setProperty('transition', reduce
        ? 'none'
        : `transform ${EXIT_MS}ms var(--ease-tahoe, cubic-bezier(0.23, 1, 0.32, 1)), opacity 180ms ease`);
      el.style.setProperty('transform-origin', '0 0');
      el.style.setProperty('transform',
        `translate3d(${x - rect.left}px, ${y - rect.top}px, 0) scale(${s})`, 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('z-index', '2', 'important');
      el.style.setProperty('border-radius', `${Math.round(6 / s)}px`);
      el.style.setProperty('overflow', 'hidden');
      el.style.setProperty('box-shadow', '0 12px 32px rgba(0, 0, 0, 0.45)');
    });

    // Home stays behind as the dimmed stage backdrop. Home is not in
    // runningApps (it's the desktop baseline), so query it directly. Only the
    // filter is touched — the app-switch zoom animation owns its other props.
    const home = document.querySelector('[data-app-id="home"]') as HTMLElement | null;
    if (home) {
      home.style.setProperty('transition', reduce ? 'none' : 'filter 200ms ease');
      home.style.setProperty('filter', 'brightness(0.45) saturate(0.85)');
    }

    setLayout(next);

    return () => {
      saved.forEach((css, el) => {
        el.style.cssText = css;
        reassertAppVisibility(el);
      });
      if (home) {
        home.style.removeProperty('filter');
        home.style.removeProperty('transition');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, idsKey]);

  useEffect(() => () => {
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const opener = document.activeElement;
    const container = containerRef.current;
    searchRef.current?.focus({ preventScroll: true });
    return () => {
      const active = document.activeElement;
      if (opener instanceof HTMLElement && opener.isConnected && (active === document.body || container?.contains(active))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [visible]);

  // -- Exit (dismiss or select): animate, then hand control back ------------
  const closeStage = useCallback((selectId?: string) => {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduce = isReduceMotion();
    const current = appsRef.current;
    current.forEach(app => {
      const el = app.element;
      if (!el || !layout.get(app.id)?.live) return;
      if (app.id === selectId) {
        // Fly the chosen window back to full screen
        el.style.setProperty('transform', 'translate3d(0, 0, 0) scale(1)', 'important');
      } else {
        el.style.setProperty('opacity', '0', 'important');
      }
    });
    const home = document.querySelector('[data-app-id="home"]') as HTMLElement | null;
    if (home) home.style.setProperty('filter', 'none');

    const finish = () => {
      exitTimerRef.current = null;
      if (selectId) onSelectApp(selectId);
      onDismiss();
    };
    if (reduce) finish();
    else exitTimerRef.current = window.setTimeout(finish, EXIT_MS);
  }, [layout, onSelectApp, onDismiss]);

  // Escape dismisses. Enter in the search field opens the first match.
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeStage(); return; }
      if (e.key === 'Enter' && !e.isComposing && e.target === searchRef.current) {
        const filtered = appsRef.current.filter(a =>
          a.id !== 'home' && a.name.toLowerCase().includes(query)
        );
        if (filtered.length > 0) closeStage(filtered[0].id);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, query, closeStage]);

  // -- Search filter dims non-matching live windows --------------------------
  useEffect(() => {
    if (!visible || closingRef.current) return;
    appsRef.current.forEach(app => {
      const el = app.element;
      if (!el || !layout.get(app.id)?.live) return;
      const match = app.name.toLowerCase().includes(query);
      el.style.setProperty('opacity', match ? '1' : '0.2', 'important');
    });
  }, [query, visible, layout]);

  const closeCard = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const card = event.currentTarget.parentElement;
    const next = card?.nextElementSibling?.querySelector<HTMLButtonElement>('.dex-stage-switch:enabled')
      ?? card?.previousElementSibling?.querySelector<HTMLButtonElement>('.dex-stage-switch:enabled')
      ?? searchRef.current;
    next?.focus({ preventScroll: true });
    onCloseApp(id);
  };

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Stage Manager"
      onClick={(e) => { if (e.target === containerRef.current) closeStage(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-max)',
        background: 'transparent',
        cursor: 'default',
      }}
    >
      <div className="dex-stage-search" style={{
        position: 'absolute',
        top: 30,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(280px, calc(100% - 48px))',
        padding: '5px 8px',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        zIndex: 3,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Filter apps"
          placeholder="Find an app"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-text-primary)',
            fontSize: 14,
            fontFamily: 'var(--font-family)',
          }}
        />
        <button type="button" className="dex-stage-close" aria-label="Close Stage Manager" onClick={() => closeStage()}>
          <DexIcon name="close" size={13} />
        </button>
      </div>

      {/* Empty state */}
      {stageApps.length === 0 && (
        <div style={{
          position: 'absolute', pointerEvents: 'none',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          color: 'var(--color-text-muted)',
          fontSize: 14,
          fontFamily: 'var(--font-family)',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="14" rx="2"/><line x1="3" y1="20" x2="21" y2="20"/></svg>
          <span>No open apps</span>
        </div>
      )}

      {/* Hit targets over each staged window: ring, label, close */}
      {stageApps.map(app => {
        const rect = layout.get(app.id);
        if (!rect) return null;
        const dimmed = !app.name.toLowerCase().includes(query);
        return (
          <div
            key={app.id}
            style={{
              position: 'absolute',
              left: rect.x - 4,
              top: rect.y - 4,
              width: rect.w + 8,
              height: rect.h + 8 + LABEL_H,
              opacity: dimmed ? 0.35 : 1,
              zIndex: 2,
            }}
          >
            {/* Fallback card when there's no live element to scale */}
            {!rect.live && (
              <div style={{
                position: 'absolute',
                left: 4, top: 4,
                width: rect.w,
                height: rect.h,
                borderRadius: 6,
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
              }}>
                <div style={{
                  width: 44, height: 44,
                  borderRadius: 10,
                  background: 'var(--color-accent-soft)',
                  color: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}>
                  <DexIcon name={app.icon || app.id} size={22} />
                </div>
              </div>
            )}

            <button type="button" className="dex-stage-switch" aria-label={`${app.minimized ? 'Restore' : 'Switch to'} ${app.name}`}
              aria-current={(app.id === activeAppId && !app.minimized) || undefined} disabled={dimmed} onClick={() => closeStage(app.id)}>
              <span className="dex-stage-frame" style={{ bottom: LABEL_H }} aria-hidden="true" />
              <span className="dex-stage-title">{app.name}</span>
            </button>
            <button type="button" className="dex-stage-close dex-stage-card-close" aria-label={`Close ${app.name}`}
              disabled={dimmed} onClick={(event) => closeCard(event, app.id)}>
              <DexIcon name="close" size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
