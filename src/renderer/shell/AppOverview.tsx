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
import { isReduceMotion } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface OverviewApp {
  id: string;
  name: string;
  icon?: string;
  color?: string;
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

const MARGIN = { top: 88, bottom: 72, left: 56, right: 56 };
const GAP = 28;
const LABEL_H = 30;
const EXIT_MS = 240;

function computeSlots(n: number, W: number, H: number): { x: number; y: number; w: number; h: number }[] {
  if (n === 0) return [];
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [layout, setLayout] = useState<Map<string, StageRect>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef(apps);
  appsRef.current = apps;
  const closingRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  const stageApps = apps.filter(a => a.id !== 'home');
  const idsKey = stageApps.map(a => a.id).join(',');

  // -- Fly live windows into the grid ---------------------------------------
  useEffect(() => {
    if (!visible) { setLayout(new Map()); return; }
    closingRef.current = false;
    const reduce = isReduceMotion();
    const current = appsRef.current.filter(a => a.id !== 'home');
    const slots = computeSlots(current.length, window.innerWidth, window.innerHeight);
    const saved = new Map<HTMLElement, string>();
    const next = new Map<string, StageRect>();

    current.forEach((app, i) => {
      const slot = slots[i];
      const el = app.element;
      if (!el) {
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
      // Divide by scale so the radius reads as ~12px on screen after scaling
      el.style.setProperty('border-radius', `${Math.round(12 / s)}px`);
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

  // -- Exit (dismiss or select): animate, then hand control back ------------
  const closeStage = useCallback((selectId?: string) => {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduce = isReduceMotion();
    const current = appsRef.current;
    current.forEach(app => {
      const el = app.element;
      if (!el || app.id === 'home') return;
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
  }, [onSelectApp, onDismiss]);

  // -- Keyboard: Escape dismisses, Enter opens first match, typing filters --
  useEffect(() => {
    if (!visible) { setSearch(''); return; }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeStage(); return; }
      if (e.key === 'Enter') {
        const filtered = appsRef.current.filter(a =>
          a.id !== 'home' && a.name.toLowerCase().includes(search.toLowerCase())
        );
        if (filtered.length > 0) closeStage(filtered[0].id);
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, search, closeStage]);

  // -- Search filter dims non-matching live windows --------------------------
  useEffect(() => {
    if (!visible || closingRef.current) return;
    const q = search.toLowerCase();
    appsRef.current.forEach(app => {
      const el = app.element;
      if (!el || app.id === 'home') return;
      const match = !q || app.name.toLowerCase().includes(q);
      el.style.setProperty('opacity', match ? '1' : '0.2', 'important');
    });
  }, [search, visible]);

  const handleCardClose = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onCloseApp(id);
  }, [onCloseApp]);

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
      {/* Search pill — hidden until the user types (first keystroke focuses it) */}
      <div style={{
        position: 'absolute',
        top: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 320,
        padding: 'var(--space-2) var(--space-4)',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        opacity: search.length > 0 ? 1 : 0,
        pointerEvents: search.length > 0 ? 'auto' : 'none',
        transition: isReduceMotion() ? 'none' : 'opacity 0.15s ease',
        zIndex: 3,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Filter apps"
          placeholder="Filter apps..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-text-primary)',
            fontSize: 14,
            fontFamily: 'var(--font-family)',
          }}
        />
      </div>

      {/* Empty state */}
      {stageApps.length === 0 && (
        <div style={{
          position: 'absolute',
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
        const isHovered = hoveredId === app.id;
        const dimmed = search && !app.name.toLowerCase().includes(search.toLowerCase());
        return (
          <div
            key={app.id}
            role="button"
            tabIndex={0}
            aria-label={`Switch to ${app.name}`}
            onClick={() => { if (!dimmed) closeStage(app.id); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeStage(app.id); } }}
            onMouseEnter={() => setHoveredId(app.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              position: 'absolute',
              left: rect.x - 4,
              top: rect.y - 4,
              width: rect.w + 8,
              height: rect.h + 8 + LABEL_H,
              cursor: dimmed ? 'default' : 'pointer',
              outline: 'none',
              zIndex: 2,
            }}
          >
            {/* Focus/hover ring around the live window */}
            <div style={{
              position: 'absolute',
              left: 0, top: 0,
              width: rect.w + 8,
              height: rect.h + 8,
              borderRadius: 14,
              border: isHovered
                ? '2px solid var(--color-accent)'
                : app.id === activeAppId
                  ? '2px solid var(--color-border)'
                  : '2px solid transparent',
              transition: isReduceMotion() ? 'none' : 'border-color 0.12s ease',
              pointerEvents: 'none',
            }} />

            {/* Fallback card when there's no live element to scale */}
            {!rect.live && (
              <div style={{
                position: 'absolute',
                left: 4, top: 4,
                width: rect.w,
                height: rect.h,
                borderRadius: 11,
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
                  borderRadius: 8,
                  background: app.color || 'var(--color-bg-hover)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}>
                  {app.icon || app.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Running</span>
              </div>
            )}

            {/* Close button on hover */}
            {isHovered && (
              <button
                onClick={(e) => handleCardClose(e, app.id)}
                title={`Close ${app.name}`}
                aria-label={`Close ${app.name}`}
                style={{
                  position: 'absolute',
                  top: -2, right: -2,
                  width: 22, height: 22,
                  borderRadius: '50%',
                  background: 'var(--color-error, rgba(192,69,58,0.9))',
                  border: '1px solid rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 3,
                }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5">
                  <line x1="1" y1="1" x2="7" y2="7"/><line x1="7" y1="1" x2="1" y2="7"/>
                </svg>
              </button>
            )}

            {/* App name */}
            <div style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '100%',
              height: LABEL_H,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12.5,
              fontWeight: isHovered ? 500 : 400,
              color: isHovered ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
              fontFamily: 'var(--font-family)',
            }}>
              {app.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};
