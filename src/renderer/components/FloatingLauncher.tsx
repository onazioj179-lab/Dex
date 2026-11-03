// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// FloatingLauncher -- "The DEX Bar". A single, clean, ROUNDED, draggable menu
// the user can place ANYWHERE in DEX. It lives at the shell level and is
// accessible on every screen. It is the only persistent surface of its kind:
// there is no fixed dock, so it never shifts as apps open/close.
//
// Default (collapsed): a rounded capsule menu with a crisp, clear border --
//   grip | apps | search | UKI | clock | expand. Nothing else. No widgets.
//
// Widgets are OPT-IN. The user clicks the expand toggle to reveal a widget
//   drawer (Now Playing + Calendar, both wired to real data). The choice
//   persists, so widgets only ever appear once the user turns them on.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFloatingLauncher } from '../store/floatingLauncherStore';
import { useUkiStore } from '../store/ukiStore';
import { useNowPlaying } from '../services/nowPlaying';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { useLearningStore } from '../store/learningStore';
import { EDGE_PAD, clampBarToBounds } from './floatingLauncherGeometry';

// Child effects run before the parent's, so the last value is also kept on
// window for AppManager to read when its listener attaches.
function publishBarInset(px: number): void {
  (window as { __dexBarInset?: number }).__dexBarInset = px;
  window.dispatchEvent(new CustomEvent('dex-bar-inset', { detail: px }));
}
import { SpotlightSearch } from '../shell/SpotlightSearch';
import DexIcon from './DexIcon';

const MOVE_THRESHOLD = 6; // px before a press becomes a drag
const BAR_H = 44;         // collapsed capsule height
const PILL_R = BAR_H / 2; // full-capsule radius when collapsed
const PANEL_R = 14;       // widget-drawer radius — matches --radius-xl / .dex-liquid-glass so it reads as menu-family
const EXPAND_KEY = 'dex-nook-expanded';
const SEARCH_W_KEY = 'dex-nook-search-w';
const SEARCH_W_DEFAULT = 240;

// --- calendar (reads the same store the Calendar app + Home widget write) ----
interface CalEvent { id: string; title: string; date: string; time: string; color?: string; icon?: string }

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readTodayEvents(): CalEvent[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem('dex-calendar-events'); } catch { return []; }
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const today = isoDay(new Date());
  const out: CalEvent[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const ev = item as CalEvent;
    if (ev.date !== today || !ev.title) continue;
    const time = typeof ev.time === 'string' && /^\d{2}:\d{2}$/.test(ev.time) ? ev.time : '00:00';
    out.push({ ...ev, time });
  }
  out.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}

function currentWeek(): { letter: string; day: number; isToday: boolean }[] {
  const now = new Date();
  // Monday-first week, matching the Calendar app grid.
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayN = now.getDate();
  const todayM = now.getMonth();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { letter: letters[i], day: d.getDate(), isToday: d.getDate() === todayN && d.getMonth() === todayM };
  });
}

export interface FloatingLauncherProps {
  /** Opens the launcher surface (app grid + search). */
  onOpen: () => void;
  /** Opens the universal Search overlay. */
  onSearch?: () => void;
}

export const FloatingLauncher: React.FC<FloatingLauncherProps> = ({ onOpen, onSearch }) => {
  const { x, y, enabled, setPosition, setEnabled } = useFloatingLauncher();

  // Widgets are opt-in: OFF by default. Persisted so they only ever show once
  // the user has turned them on.
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(EXPAND_KEY) === '1'; } catch { return false; }
  });
  const toggleExpanded = useCallback(() => {
    setExpanded(v => {
      const next = !v;
      try { localStorage.setItem(EXPAND_KEY, next ? '1' : '0'); } catch { /* quota */ }
      return next;
    });
  }, []);

  // Search field width -- user-resizable with the mouse (drag the grip), persisted,
  // defaults to a compact size. The dock search IS the search now (no separate
  // overlay); it stretches to whatever width the user drags.
  const [searchWidth, setSearchWidth] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem(SEARCH_W_KEY) || '', 10); return Number.isFinite(v) && v >= 160 && v <= 520 ? v : SEARCH_W_DEFAULT; } catch { return SEARCH_W_DEFAULT; }
  });
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const beginResize = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: searchWidth };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  }, [searchWidth]);
  const onResizeMove = useCallback((e: React.PointerEvent) => {
    const r = resizeRef.current; if (!r) return;
    setSearchWidth(Math.max(160, Math.min(520, r.startW + (e.clientX - r.startX))));
  }, []);
  const onResizeUp = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* released */ }
    setSearchWidth(w => { try { localStorage.setItem(SEARCH_W_KEY, String(w)); } catch { /* quota */ } return w; });
  }, []);

  // Now-playing (real audio engine bridge).
  const track = useNowPlaying(s => s.track);
  const isPlaying = useNowPlaying(s => s.isPlaying);
  const toggle = useNowPlaying(s => s.toggle);
  const next = useNowPlaying(s => s.next);
  const prev = useNowPlaying(s => s.prev);

  // UKI presence: the mic button mirrors her live state so the bar is the one
  // glanceable "is she awake?" signal across the whole shell. Awake+working ->
  // accent glyph with a slow breathing glow; asleep (dormant) -> dimmed.
  const ukiState = useUkiStore(s => s.state);
  const ukiActive = ukiState === 'listening' || ukiState === 'processing' || ukiState === 'thinking' || ukiState === 'speaking';
  const ukiAsleep = ukiState === 'dormant';

  const launchApp = useRunningApps(s => s.launchApp);
  const openApp = useCallback((id: string) => {
    try { const def = APP_DEFINITIONS[id]; if (def) launchApp({ id, name: def.name, icon: def.icon, color: def.color }); } catch { /* not registered */ }
  }, [launchApp]);

  // Suggested apps (quiet learning surface): learned ranking first (frequency,
  // recency, time-of-day, app->app pairing from the silent learning store), then
  // remaining slots filled from raw recency (sessionHistory) for cold start.
  // Always excludes `home` and the current app; degrades to empty silently.
  const sessionHistory = useRunningApps(s => s.sessionHistory);
  const currentAppId = useRunningApps(s => s.currentAppId);
  const learningEnabled = useLearningStore(s => s.enabled);
  const learningPatterns = useLearningStore(s => s.patterns);
  const getAppSuggestions = useLearningStore(s => s.getAppSuggestions);
  const recentApps = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; icon: string; color: string }> = [];
    const push = (id: string) => {
      if (id === 'home' || id === currentAppId || seen.has(id)) return;
      const def = APP_DEFINITIONS[id];
      if (!def) return; // unregistered / stale id — skip quietly
      seen.add(id);
      out.push({ id, name: def.name, icon: def.icon, color: def.color });
    };
    void learningPatterns; // read so this recomputes as the model updates
    if (learningEnabled) {
      for (const id of getAppSuggestions(currentAppId, 5)) {
        push(id);
        if (out.length >= 5) break;
      }
    }
    for (const id of sessionHistory) {
      if (out.length >= 5) break;
      push(id);
    }
    return out;
  }, [sessionHistory, currentAppId, learningEnabled, learningPatterns, getAppSuggestions]);
  const openRecent = useCallback((id: string) => {
    // Launch directly via the same reliable path the music/calendar buttons use.
    // The old code dispatched dex-open-app with { id }, but every handler keys
    // off { appId } -- so the recent buttons silently did nothing. openApp works.
    openApp(id);
  }, [openApp]);

  const [today, setToday] = useState<CalEvent[]>([]);
  const week = useMemo(currentWeek, []);
  const monthLabel = useMemo(() => new Date().toLocaleDateString(undefined, { month: 'long' }), []);

  // --- drag state -----------------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 240, h: BAR_H });
  // Default placement: a padded BOTTOM-centre dock, clearly separate from the
  // top window chrome. Unset store (x < 0) resolves this; clampNow corrects it
  // to the measured size right after mount.
  const [pos, setPos] = useState(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    if (x < 0 || y < 0) return { x: Math.max(EDGE_PAD, Math.round((vw - 240) / 2)), y: Math.max(EDGE_PAD, vh - BAR_H - EDGE_PAD) };
    return { x, y };
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // Measure the rendered bar and pull it on-screen. Runs on mount, expand
  // change, and resize -- not every render -- so there's no reflow loop.
  const clampNow = useCallback(() => {
    const el = containerRef.current;
    if (el) sizeRef.current = { w: el.offsetWidth, h: el.offsetHeight };
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    if (vw < 80 || vh < 80) return;
    setPos(p => clampBarToBounds(p.x, p.y, vw, vh, sizeRef.current.w, sizeRef.current.h));
  }, []);

  useLayoutEffect(() => { clampNow(); }, [expanded, clampNow]);

  // Publish how much of the bottom edge the bar covers, so app content and
  // maximized windows can stop above it. Only when docked in the lower part of
  // the screen, and only after a drag settles (no per-frame layout churn).
  useEffect(() => {
    if (dragging) return;
    const vh = window.innerHeight;
    // Reserve a strip only when the bar is docked against the bottom edge (like
    // the macOS Dock). A bar left floating higher up overlays content instead;
    // reserving for it left an empty band under every app.
    const barBottom = pos.y + sizeRef.current.h;
    const docked = enabled && vh - barBottom <= 64;
    const inset = docked ? Math.max(0, Math.round(vh - pos.y + EDGE_PAD)) : 0;
    publishBarInset(inset);
  }, [pos.y, dragging, enabled]);
  useEffect(() => () => publishBarInset(0), []);
  useEffect(() => {
    window.addEventListener('resize', clampNow);
    return () => window.removeEventListener('resize', clampNow);
  }, [clampNow]);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  // Today's events -- only polled while the widget drawer is open.
  useEffect(() => {
    if (!expanded) return;
    setToday(readTodayEvents());
    const onStorage = (e: StorageEvent) => { if (e.key === 'dex-calendar-events') setToday(readTodayEvents()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [expanded]);

  const beginDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  }, [pos.x, pos.y]);

  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    pendingRef.current = { clientX: e.clientX, clientY: e.clientY };
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const p = pendingRef.current, dd = dragRef.current;
        if (!p || !dd) return;
        const { w, h } = sizeRef.current;
        setPos(clampBarToBounds(dd.origX + (p.clientX - dd.startX), dd.origY + (p.clientY - dd.startY), window.innerWidth, window.innerHeight, w, h));
      });
    }
  }, []);

  const onDragUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* released */ }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (!d || !d.moved) { setDragging(false); return; }
    setDragging(false);
    const p = pendingRef.current;
    let fx = pos.x, fy = pos.y;
    if (p) {
      const { w, h } = sizeRef.current;
      const c = clampBarToBounds(d.origX + (p.clientX - d.startX), d.origY + (p.clientY - d.startY), window.innerWidth, window.innerHeight, w, h);
      fx = c.x; fy = c.y; setPos(c);
    }
    pendingRef.current = null;
    setPosition(fx, fy);
  }, [pos.x, pos.y, setPosition]);

  if (!enabled) return null;

  // --- shared styles --------------------------------------------------------
  const vDivider = (m = 0): React.CSSProperties => ({ width: 1, alignSelf: 'stretch', margin: `${m}px 0`, background: 'var(--color-border-subtle, rgba(255,255,255,0.10))' });
  const ctrlBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 10, border: 'none', padding: 0,
    background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
    transition: 'background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease',
  };
  // Premium "interactive glass" hover: soft fill, brighter glyph, and a faint
  // inset rim so each control reads as its own lit glass chip (monochrome).
  const hoverIn = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = 'var(--color-bg-hover, #1e1e22)'; e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.10)'; };
  const hoverOut = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.boxShadow = 'none'; };
  // UKI mic keeps its accent tint on hover-out while she is awake, so the
  // presence cue never flickers off mid-interaction.
  const ukiHoverOut = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ukiActive ? 'var(--color-accent)' : 'var(--color-text-secondary)'; e.currentTarget.style.boxShadow = 'none'; };

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="DEX menu"
      data-dex-nook
      className="dex-liquid-glass"
      style={{
        // IMPORTANT: position via left/top, NOT transform. DEX has global rules
        // (globals.css `[data-perf-tier="low"] *:hover/active/focus` and
        // ScreenGuardSystem `[role=button]:active`) that force `transform: none
        // !important` on hover/press. A transform-positioned bar gets its
        // position wiped the instant you touch it -> it snaps to the corner and
        // "glitches back and forth". left/top is immune. This is the root cause
        // of the long-standing drag glitch across every prior launcher design.
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 'var(--z-dock)' as unknown as number,
        boxSizing: 'border-box',
        // Liquid glass via the .dex-liquid-glass class (real backdrop blur +
        // saturation + specular rim; auto-solid in lite mode / reduced-transparency).
        // Background/blur/border come from the class; only the DYNAMIC radius +
        // drag-elevation shadow are inline. The inline box-shadow includes the
        // specular insets so the lit-glass look survives the inline override.
        borderRadius: expanded ? PANEL_R : PILL_R,
        // visible (not hidden) so the search results dropdown can escape the bar.
        // The glass bg + border still clip to border-radius (background respects
        // the radius regardless of overflow); only overflowing children show.
        overflow: 'visible',
        // Elevation from the canonical popover shadow token (same float as every
        // dropdown/menu) so the bar shares ONE elevation scale with menus; only
        // the drag-lift delta + the specular glass rims stay inline.
        boxShadow: (dragging
          ? 'var(--pg-shadow-popover-strong, 0 10px 40px rgba(0,0,0,0.33)), 0 0 0 0.5px rgba(0,0,0,0.5)'
          : 'var(--pg-shadow-popover, 0 10px 30px rgba(0,0,0,0.36)), 0 0 0 0.5px rgba(0,0,0,0.45)')
          + ', inset 0 1px 0 rgba(255,255,255,0.18), inset 1px 0 0 rgba(255,255,255,0.06), inset -1px 0 0 rgba(255,255,255,0.06)',
        userSelect: 'none',
        // Premium one-time entrance: opacity-only (no transform) so it never
        // fights the left/top drag positioning. Plays once on mount.
        animation: 'dexBarIn 0.34s ease both',
        // No position transition: the bar tracks the pointer 1:1 while dragging
        // and settles exactly where released -- no ease that could read as a
        // snap-back. Only the chrome (shadow/radius) eases.
        transition: dragging ? 'none' : 'box-shadow 0.16s ease, border-radius 0.16s ease',
      }}
    >
      {/* The bar -- always visible. The whole row is the drag handle; the
          buttons stop propagation so a click never drags. */}
      <div
        onPointerDown={beginDrag}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        onPointerCancel={onDragUp}
        style={{
          display: 'flex', alignItems: 'center', gap: 2, height: BAR_H, padding: '0 8px',
          cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none',
        }}
      >
        {/* grip */}
        <div aria-hidden="true" style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="var(--color-text-tertiary, #8e8e93)" aria-hidden="true">
            {[1, 7, 13].map(cy => [1.5, 6.5].map(cx => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" />))}
          </svg>
        </div>

        <button type="button" className="dex-pressable" aria-label="Open launcher" onPointerDown={e => e.stopPropagation()} onClick={onOpen} style={ctrlBtn} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            {[[1, 1], [10, 1], [1, 10], [10, 10]].map(([rx, ry]) => <rect key={`${rx}-${ry}`} x={rx} y={ry} width="7" height="7" rx="2" fill="currentColor" />)}
          </svg>
        </button>
        {/* The dock search IS the search now: a real field whose results dropdown
            drops straight from it (UP, since the dock sits near the bottom). The
            old full-screen Spotlight overlay is gone. stopPropagation keeps typing/
            clicking from dragging the bar; the grip beside it resizes the field. */}
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{ width: searchWidth, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center' }}
        >
          <SpotlightSearch
            variant="home"
            pillHeight={32}
            dropUp={pos.y > (typeof window !== 'undefined' ? window.innerHeight : 800) / 2}
            placeholder="Search"
            hideVoice
            onNavigate={(appId) => openApp(appId)}
          />
        </div>
        {/* Resize grip -- drag to widen / narrow the search; size persists. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize search"
          title="Drag to resize search"
          onPointerDown={beginResize}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          style={{ width: 8, alignSelf: 'stretch', flexShrink: 0, cursor: 'ew-resize', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ width: 2, height: 16, borderRadius: 1, background: 'var(--color-border, rgba(255,255,255,0.16))' }} />
        </div>
        <button
          type="button"
          className={`dex-pressable${ukiActive ? ' dex-uki-awake' : ''}`}
          aria-label={ukiActive ? 'UKI is active -- open assistant' : ukiAsleep ? 'UKI is asleep -- open assistant' : 'Open UKI assistant'}
          title={ukiActive ? 'UKI is active' : ukiAsleep ? 'UKI is asleep' : 'Open UKI assistant'}
          onPointerDown={e => e.stopPropagation()}
          onClick={() => { try { useUkiStore.getState().togglePanel(); } catch { /* not ready */ } }}
          style={{
            ...ctrlBtn,
            color: ukiActive ? 'var(--color-accent)' : ctrlBtn.color,
            opacity: ukiAsleep ? 0.45 : 1,
            // Glow + breath ride on `filter` (driven by the .dex-uki-awake
            // keyframe) so the bar's hover handlers, which only touch
            // background/color/box-shadow, can never clobber the presence cue.
            animation: ukiActive ? 'dexUkiBreath 2.4s ease-in-out infinite' : 'none',
            transition: 'opacity 0.25s ease, color 0.2s ease',
          }}
          onMouseEnter={hoverIn}
          onMouseLeave={ukiHoverOut}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>

        <div style={vDivider(11)} />

        {/* expand toggle -- turns widgets on/off (opt-in) */}
        <button
          type="button"
          aria-label={expanded ? 'Hide widgets' : 'Show widgets'}
          aria-expanded={expanded}
          onPointerDown={e => e.stopPropagation()}
          onClick={toggleExpanded}
          style={{ ...ctrlBtn, width: 28 }}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.16s ease' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Widget drawer -- OPT-IN. Only present once the user expands. Springs in. */}
      {expanded && (
        <div className="dex-drawer-in">
        <div style={{ display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.10))' }}>
          {/* Now Playing */}
          <div style={{ width: 178, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <button
                type="button" aria-label="Open Music" onClick={() => openApp('audio')}
                style={{
                  width: 42, height: 42, flexShrink: 0, borderRadius: 10, padding: 0, cursor: 'pointer',
                  border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.10))',
                  background: track?.artwork ? `center/cover no-repeat url(${JSON.stringify(track.artwork)})` : 'var(--color-bg-inset, #101012)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}
              >
                {!track?.artwork && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                )}
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track?.title || 'Nothing playing'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track?.artist || 'Open Music to start'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" aria-label="Previous" onClick={prev} disabled={!track} style={{ ...ctrlBtn, width: 30, height: 28, opacity: track ? 1 : 0.4, cursor: track ? 'pointer' : 'default' }} onMouseEnter={track ? hoverIn : undefined} onMouseLeave={track ? hoverOut : undefined}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
              </button>
              <button type="button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={toggle} disabled={!track}
                style={{ ...ctrlBtn, width: 32, height: 30, borderRadius: 10, background: track ? 'var(--color-accent-fill)' : 'var(--color-bg-hover)', color: track ? 'var(--color-accent-text, #fff)' : 'var(--color-text-tertiary)', opacity: track ? 1 : 0.5, cursor: track ? 'pointer' : 'default' }}>
                {isPlaying
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <button type="button" aria-label="Next" onClick={next} disabled={!track} style={{ ...ctrlBtn, width: 30, height: 28, opacity: track ? 1 : 0.4, cursor: track ? 'pointer' : 'default' }} onMouseEnter={track ? hoverIn : undefined} onMouseLeave={track ? hoverOut : undefined}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 6h2v12h-2zm-2 6L6 6v12z" /></svg>
              </button>
            </div>
          </div>

          <div style={vDivider(8)} />

          {/* Calendar */}
          <div style={{ width: 184, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <button
              type="button" onClick={() => openApp('calendar')}
              style={{ display: 'flex', alignItems: 'baseline', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{monthLabel}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{new Date().getFullYear()}</span>
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
              {week.map((d, i) => (
                <div key={`l-${i}`} style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>{d.letter}</div>
              ))}
              {week.map((d, i) => (
                <div key={`d-${i}`} style={{
                  fontSize: 11, padding: '3px 0', borderRadius: 6,
                  fontWeight: d.isToday ? 700 : 400,
                  color: d.isToday ? 'var(--color-accent-text, #fff)' : 'var(--color-text-primary)',
                  background: d.isToday ? 'var(--color-accent-fill)' : 'transparent',
                }}>{d.day}</div>
              ))}
            </div>
            <div style={{ paddingTop: 6, borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.10))', minHeight: 18 }}>
              {today.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Nothing for today</div>
              ) : today.slice(0, 2).map(ev => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0', minWidth: 0 }}>
                  {ev.icon
                    ? <span style={{ color: ev.color || 'var(--color-accent)', display: 'inline-flex', flexShrink: 0 }}><DexIcon name={ev.icon} size={12} color="currentColor" /></span>
                    : <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: ev.color || 'var(--color-accent)' }} />}
                  <span style={{ fontSize: 11, color: 'var(--color-text-primary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ev.title}>{ev.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{ev.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Suggested apps -- learned quick-launch. Renders nothing without data. */}
        {recentApps.length > 0 && (
          <div
            role="group"
            aria-label="Suggested apps"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 10px',
              borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.10))',
            }}
          >
            {recentApps.map(app => (
              <button
                key={app.id}
                type="button"
                title={app.name}
                aria-label={`Open ${app.name}`}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => openRecent(app.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, flexShrink: 0, borderRadius: 10, padding: 0,
                  border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.10))',
                  background: 'var(--color-bg-inset, #101012)', cursor: 'pointer',
                  color: app.color && app.color.startsWith('var(') ? app.color : (app.color || 'var(--color-text-secondary)'),
                  transition: 'background 0.12s ease, border-color 0.12s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover, #1e1e22)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-inset, #101012)'; }}
              >
                <DexIcon name={app.icon} size={17} color="currentColor" />
              </button>
            ))}
          </div>
        )}

        {/* Hide the bar. Re-show from Settings > Shell & Dock > Show DEX Bar. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 10px', borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.10))' }}>
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={() => setEnabled(false)}
            title="Hide the DEX Bar (re-enable in Settings > Shell & Dock)"
            aria-label="Hide DEX Bar"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6,
              border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.10))',
              background: 'transparent', cursor: 'pointer', fontSize: 11,
              color: 'var(--color-text-secondary)', transition: 'background 0.12s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover, #1e1e22)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <DexIcon name="close" size={12} color="currentColor" /> Hide bar
          </button>
        </div>
        </div>
      )}
    </div>
  );
};

export default FloatingLauncher;
