// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// The DEX Dock -- a compact floating overlay that morphs between two states:
//
//   COLLAPSED  a 36 px search icon. Always visible, always usable.
//   EXPANDED   the strip: App Menu, pinned + running apps, DEX Search, UKI.
//
// Activating the icon expands the strip around the same centre and puts the
// caret in DEX Search. After an idle period it folds back (Settings > Dock),
// never while the pointer is over it, focus is inside it, a query is typed or
// it is being dragged. Escape folds it too.
//
// It is an overlay: it never reserves space or resizes windows. Position is an
// anchor (centre x, top y) the user can drag anywhere below the top bar;
// placement is clamped to the viewport whatever the strip's width.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFloatingLauncher } from '../store/floatingLauncherStore';
import { useUkiStore } from '../store/ukiStore';
import { useNowPlaying } from '../services/nowPlaying';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { useLearningStore } from '../store/learningStore';
import { DOCK_ROW, defaultDockAnchor, magnetDockAnchor, placeDock } from './floatingLauncherGeometry';
import { isReduceMotion } from '../utils/MotionController';

import { SpotlightSearch } from '../shell/SpotlightSearch';
import DexIcon from './DexIcon';
import { DockPins } from './DockPins';

const MOVE_THRESHOLD = 6;  // px before a press becomes a drag
export const DOCK_IDLE_MS = 6000; // auto-collapse after this long untouched
const SEARCH_W = 168;      // compact search field
const MORPH_MS = 220;
const EXPAND_KEY = 'dex-nook-expanded';

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
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { letter: letters[i], day: d.getDate(), isToday: d.getDate() === now.getDate() && d.getMonth() === now.getMonth() };
  });
}

/** Bottom edge of the fixed top bar, measured live (falls back to 34). */
function topBarHeight(): number {
  if (typeof document === 'undefined') return 34;
  const el = document.querySelector<HTMLElement>('[data-dex-chrome="topbar"]');
  return el ? el.getBoundingClientRect().bottom : 34;
}

export interface FloatingLauncherProps {
  /** Opens the App Menu (app grid + search). */
  onOpen: () => void;
  /** Kept for callers; DEX Search lives in the Dock itself now. */
  onSearch?: () => void;
}

const GlyphSearch = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.2" y2="16.2" />
  </svg>
);

export const FloatingLauncher: React.FC<FloatingLauncherProps> = ({ onOpen }) => {
  const cxStore = useFloatingLauncher(s => s.cx);
  const yStore = useFloatingLauncher(s => s.y);
  const enabled = useFloatingLauncher(s => s.enabled);
  const expanded = useFloatingLauncher(s => s.expanded);
  const autoCollapse = useFloatingLauncher(s => s.autoCollapse);
  const setAnchor = useFloatingLauncher(s => s.setAnchor);
  const setEnabled = useFloatingLauncher(s => s.setEnabled);
  const setExpanded = useFloatingLauncher(s => s.setExpanded);

  // Viewport, tracked so placement re-clamps on resize / display change.
  const [vp, setVp] = useState(() => ({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Anchor: saved, else bottom-centre.
  const anchor = useMemo(() => {
    if (cxStore < 0 || yStore < 0) return defaultDockAnchor(vp.w, vp.h);
    return { cx: cxStore, y: yStore };
  }, [cxStore, yStore, vp.w, vp.h]);
  const [drag, setDrag] = useState<{ cx: number; y: number } | null>(null);
  const live = drag ?? anchor;

  // Widgets drawer: opt-in, persisted.
  const [widgets, setWidgets] = useState<boolean>(() => { try { return localStorage.getItem(EXPAND_KEY) === '1'; } catch { return false; } });
  const toggleWidgets = useCallback(() => setWidgets(v => { const n = !v; try { localStorage.setItem(EXPAND_KEY, n ? '1' : '0'); } catch { /* quota */ } return n; }), []);

  // --- strip width (measured) ------------------------------------------------
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripW, setStripW] = useState(420);
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const measure = () => setStripW(Math.ceil(el.scrollWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  const width = expanded ? stripW : DOCK_ROW;
  const topBar = topBarHeight();
  const place = placeDock(live.cx, live.y, width, vp.w, vp.h, topBar);

  // Morph: clip while the width animates, so the strip reveals from the icon.
  const reduce = isReduceMotion();
  const [morphing, setMorphing] = useState(false);
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    if (reduce) return;
    setMorphing(true);
    const t = window.setTimeout(() => setMorphing(false), MORPH_MS + 40);
    return () => window.clearTimeout(t);
  }, [expanded, reduce]);

  // --- interaction state for auto-collapse ----------------------------------
  const rootRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [activity, setActivity] = useState(0);
  const bump = useCallback(() => setActivity(n => n + 1), []);

  useEffect(() => {
    if (!expanded || !autoCollapse || hovered || focusWithin || drag || widgets) return;
    const t = window.setTimeout(() => {
      const q = rootRef.current?.querySelector('input')?.value ?? '';
      if (q.trim()) { bump(); return; } // a typed query keeps it open
      setExpanded(false);
    }, DOCK_IDLE_MS);
    return () => window.clearTimeout(t);
  }, [expanded, autoCollapse, hovered, focusWithin, drag, widgets, activity, setExpanded, bump]);

  const focusSearch = useCallback(() => {
    window.setTimeout(() => {
      const input = rootRef.current?.querySelector('input');
      if (input instanceof HTMLInputElement) input.focus();
    }, reduce ? 0 : 120);
  }, [reduce]);

  // Any surface can open DEX Search in the Dock (dispatch `dex-dock-search`).
  useEffect(() => {
    const onOpenSearch = () => { setExpanded(true); focusSearch(); };
    window.addEventListener('dex-dock-search', onOpenSearch);
    return () => window.removeEventListener('dex-dock-search', onOpenSearch);
  }, [setExpanded, focusSearch]);

  // --- drag (whole row; buttons and the field stop propagation) -------------
  const dragRef = useRef<{ sx: number; sy: number; ocx: number; oy: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const onDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ocx: live.cx, oy: live.y, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  }, [live.cx, live.y]);
  const onMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
    d.moved = true;
    pendingRef.current = { x: d.ocx + dx, y: d.oy + dy };
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingRef.current) setDrag({ cx: pendingRef.current.x, y: pendingRef.current.y });
      });
    }
  }, []);
  const onUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (!d || !d.moved) { setDrag(null); return; }
    justDraggedRef.current = true;
    const p = pendingRef.current ?? { x: d.ocx, y: d.oy };
    pendingRef.current = null;
    // Save the PLACED anchor (a drag past an edge never stores an off-screen
    // centre), then magnet to bottom / top / centre.
    const w = expanded ? stripW : DOCK_ROW;
    const tb = topBarHeight();
    const placed = placeDock(p.x, p.y, w, window.innerWidth, window.innerHeight, tb);
    const m = magnetDockAnchor(placed.left + w / 2, placed.top, window.innerWidth, window.innerHeight, tb);
    setDrag(null);
    setAnchor(m.cx, m.y);
  }, [expanded, stripW, setAnchor]);

  const activateIcon = useCallback(() => {
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    setExpanded(true);
    focusSearch();
  }, [setExpanded, focusSearch]);

  // --- data for the widget drawer -------------------------------------------
  const track = useNowPlaying(s => s.track);
  const isPlaying = useNowPlaying(s => s.isPlaying);
  const toggle = useNowPlaying(s => s.toggle);
  const next = useNowPlaying(s => s.next);
  const prev = useNowPlaying(s => s.prev);

  const ukiState = useUkiStore(s => s.state);
  const ukiActive = ukiState === 'listening' || ukiState === 'processing' || ukiState === 'thinking' || ukiState === 'speaking';
  const ukiAsleep = ukiState === 'dormant';

  const launchApp = useRunningApps(s => s.launchApp);
  const openApp = useCallback((id: string) => {
    try { const def = APP_DEFINITIONS[id]; if (def) launchApp({ id, name: def.name, icon: def.icon, color: def.color }); } catch { /* not registered */ }
  }, [launchApp]);

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
      if (!def) return;
      seen.add(id);
      out.push({ id, name: def.name, icon: def.icon, color: def.color });
    };
    void learningPatterns;
    if (learningEnabled) for (const id of getAppSuggestions(currentAppId, 5)) { push(id); if (out.length >= 5) break; }
    for (const id of sessionHistory) { if (out.length >= 5) break; push(id); }
    return out;
  }, [sessionHistory, currentAppId, learningEnabled, learningPatterns, getAppSuggestions]);

  const [today, setToday] = useState<CalEvent[]>([]);
  const week = useMemo(currentWeek, []);
  const monthLabel = useMemo(() => new Date().toLocaleDateString(undefined, { month: 'long' }), []);
  useEffect(() => {
    if (!widgets || !expanded) return;
    setToday(readTodayEvents());
    const onStorage = (e: StorageEvent) => { if (e.key === 'dex-calendar-events') setToday(readTodayEvents()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [widgets, expanded]);

  // Focus mode hides the Dock (pointer at the bottom edge reveals it).
  const [fullscreenFront, setFullscreenFront] = useState(() => (window as { __dexFullscreenFront?: boolean }).__dexFullscreenFront === true);
  useEffect(() => {
    const on = (e: Event) => setFullscreenFront((e as CustomEvent<boolean>).detail === true);
    window.addEventListener('dex-fullscreen-front', on);
    return () => window.removeEventListener('dex-fullscreen-front', on);
  }, []);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!fullscreenFront) { setRevealed(false); return; }
    const onPointer = (e: PointerEvent) => {
      if (e.clientY >= window.innerHeight - 6) setRevealed(true);
      else if (!rootRef.current?.matches(':hover')) setRevealed(false);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    return () => window.removeEventListener('pointermove', onPointer);
  }, [fullscreenFront]);
  const hidden = fullscreenFront && !revealed && !drag;

  if (!enabled) return null;

  // --- styles ----------------------------------------------------------------
  const ctrl: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    width: 28, height: 28, borderRadius: 9999, border: 'none', padding: 0,
    background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
    transition: 'background 0.12s ease, color 0.12s ease',
  };
  const hoverIn = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'var(--color-text-primary)'; };
  const hoverOut = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; };
  const divider: React.CSSProperties = { width: 1, height: 16, background: 'rgba(255,255,255,0.12)', flexShrink: 0, margin: '0 2px' };
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const drawerUp = place.top > vp.h / 2;
  const showDrawer = expanded && widgets && !morphing;
  const clip = !expanded || morphing;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Dock"
      data-dex-chrome="dex-bar"
      data-dex-nook
      data-dock-state={expanded ? 'expanded' : 'collapsed'}
      data-autohidden={hidden ? '' : undefined}
      className="dex-liquid-glass dex-glass-specular dex-glass-refract"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerMove={bump}
      onFocusCapture={() => { setFocusWithin(true); if (fullscreenFront) setRevealed(true); }}
      onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false); }}
      onKeyDown={e => {
        bump();
        if (e.key === 'Escape' && expanded) {
          const q = e.target instanceof HTMLInputElement ? e.target.value : '';
          if (!q) { e.preventDefault(); setExpanded(false); }
        }
      }}
      style={{
        // left/top, never transform: global hover/press rules force
        // `transform: none !important`, which would snap a transformed Dock.
        position: 'fixed', left: place.left, top: hidden ? vp.h + 4 : place.top,
        width, height: DOCK_ROW, boxSizing: 'border-box',
        zIndex: 'var(--z-dock)' as unknown as number,
        borderRadius: 9999,
        overflow: clip ? 'hidden' : 'visible',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : undefined,
        userSelect: 'none',
        boxShadow: drag
          ? '0 10px 32px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.18)'
          : '0 6px 22px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.18)',
        // Shared-element morph: the icon's own box grows into the strip around
        // the same centre (width + left together). No bounce.
        transition: drag || reduce
          ? 'none'
          : `width ${MORPH_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), left ${MORPH_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), top 0.2s ease, opacity 0.16s ease, box-shadow 0.16s ease`,
      }}
    >
      {/* COLLAPSED: the search icon. Click (or Enter) opens DEX Search; drag moves. */}
      <div
        role="button"
        tabIndex={expanded ? -1 : 0}
        aria-hidden={expanded}
        aria-label="Open DEX Search"
        title="Search · drag to move"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={activateIcon}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); justDraggedRef.current = false; activateIcon(); } }}
        style={{
          position: 'absolute', left: 0, top: 0, width: DOCK_ROW, height: DOCK_ROW,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-primary)', cursor: drag ? 'grabbing' : 'pointer', touchAction: 'none',
          opacity: expanded ? 0 : 1, pointerEvents: expanded ? 'none' : 'auto',
          transition: reduce ? 'none' : 'opacity 0.14s ease',
        }}
      >
        <GlyphSearch />
      </div>

      {/* EXPANDED: the strip. Measured for width; the row background drags. */}
      <div
        ref={stripRef}
        aria-hidden={!expanded}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          position: 'absolute', left: 0, top: 0, height: DOCK_ROW,
          display: 'flex', alignItems: 'center', gap: 2, padding: '0 5px', whiteSpace: 'nowrap',
          opacity: expanded ? 1 : 0, pointerEvents: expanded ? 'auto' : 'none',
          transition: reduce ? 'none' : `opacity ${expanded ? '0.18s' : '0.1s'} ease ${expanded ? '0.05s' : '0s'}`,
          cursor: drag ? 'grabbing' : 'grab', touchAction: 'none',
        }}
      >
        <button type="button" tabIndex={expanded ? 0 : -1} aria-label="Open App Menu" title="Apps" onPointerDown={stop} onClick={onOpen} style={ctrl} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            {[[1, 1], [10, 1], [1, 10], [10, 10]].map(([rx, ry]) => <rect key={`${rx}-${ry}`} x={rx} y={ry} width="7" height="7" rx="2" fill="currentColor" />)}
          </svg>
        </button>
        <DockPins maxWidth={Math.max(120, Math.min(420, vp.w - SEARCH_W - 180))} size={28} showRunning />
        <div style={divider} />
        <div onPointerDown={stop} style={{ width: SEARCH_W, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <SpotlightSearch
            variant="home"
            pillHeight={26}
            dropUp={drawerUp}
            placeholder="Search DEX"
            hideVoice
            onNavigate={(appId) => openApp(appId)}
          />
        </div>
        <button
          type="button"
          tabIndex={expanded ? 0 : -1}
          className={ukiActive ? 'dex-uki-awake' : undefined}
          aria-label={ukiActive ? 'UKI is active -- open assistant' : ukiAsleep ? 'UKI is asleep -- open assistant' : 'Open UKI assistant'}
          title={ukiActive ? 'UKI is active' : ukiAsleep ? 'UKI is asleep' : 'UKI'}
          onPointerDown={stop}
          onClick={() => { try { useUkiStore.getState().togglePanel(); } catch { /* not ready */ } }}
          style={{ ...ctrl, color: ukiActive ? 'var(--color-accent)' : ctrl.color, opacity: ukiAsleep ? 0.45 : 1, animation: ukiActive ? 'dexUkiBreath 2.4s ease-in-out infinite' : 'none' }}
          onMouseEnter={hoverIn}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ukiActive ? 'var(--color-accent)' : 'var(--color-text-secondary)'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>
        <button type="button" tabIndex={expanded ? 0 : -1} aria-label={widgets ? 'Hide widgets' : 'Show widgets'} aria-expanded={widgets} title="Widgets" onPointerDown={stop} onClick={toggleWidgets} style={{ ...ctrl, width: 24 }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transform: (widgets !== drawerUp) ? 'rotate(180deg)' : 'none', transition: 'transform 0.16s ease' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button type="button" tabIndex={expanded ? 0 : -1} aria-label="Collapse Dock to the search icon" title="Collapse (Esc)" onPointerDown={stop} onClick={() => setExpanded(false)} style={{ ...ctrl, width: 24 }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
          </svg>
        </button>
      </div>

      {/* Widget drawer: opt-in; opens away from the nearest edge. */}
      {showDrawer && (
        <div
          className="dex-liquid-glass dex-drawer-in"
          onPointerDown={stop}
          style={{
            position: 'absolute', left: '50%', marginLeft: -186, width: 372,
            [drawerUp ? 'bottom' : 'top']: DOCK_ROW + 8,
            borderRadius: 14, overflow: 'hidden',
          } as React.CSSProperties}
        >
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
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
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track?.title || 'Nothing playing'}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track?.artist || 'Open Music to start'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" aria-label="Previous" onClick={prev} disabled={!track} style={{ ...ctrl, opacity: track ? 1 : 0.4 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
                </button>
                <button type="button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={toggle} disabled={!track}
                  style={{ ...ctrl, background: track ? 'var(--color-accent-fill)' : 'rgba(255,255,255,0.08)', color: track ? 'var(--color-accent-text, #fff)' : 'var(--color-text-tertiary)', opacity: track ? 1 : 0.5 }}>
                  {isPlaying
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
                </button>
                <button type="button" aria-label="Next" onClick={next} disabled={!track} style={{ ...ctrl, opacity: track ? 1 : 0.4 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 6h2v12h-2zm-2 6L6 6v12z" /></svg>
                </button>
              </div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button type="button" onClick={() => openApp('calendar')} style={{ display: 'flex', alignItems: 'baseline', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{monthLabel}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{new Date().getFullYear()}</span>
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
                {week.map((d, i) => <div key={`l-${i}`} style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>{d.letter}</div>)}
                {week.map((d, i) => (
                  <div key={`d-${i}`} style={{ fontSize: 11, padding: '3px 0', borderRadius: 6, fontWeight: d.isToday ? 700 : 400, color: d.isToday ? 'var(--color-accent-text, #fff)' : 'var(--color-text-primary)', background: d.isToday ? 'var(--color-accent-fill)' : 'transparent' }}>{d.day}</div>
                ))}
              </div>
              <div style={{ paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', minHeight: 18 }}>
                {today.length === 0
                  ? <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Nothing for today</div>
                  : today.slice(0, 2).map(ev => (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0', minWidth: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: ev.color || 'var(--color-accent)' }} />
                      <span style={{ fontSize: 11, color: 'var(--color-text-primary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ev.title}>{ev.title}</span>
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{ev.time}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          {recentApps.length > 0 && (
            <div role="group" aria-label="Suggested apps" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              {recentApps.map(app => (
                <button key={app.id} type="button" title={app.name} aria-label={`Open ${app.name}`} onClick={() => openApp(app.id)}
                  style={{ ...ctrl, width: 30, height: 30, background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}
                  onMouseEnter={hoverIn} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}>
                  <DexIcon name={app.icon} size={16} color="currentColor" />
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button type="button" className="dex-pill" onClick={() => setEnabled(false)} title="Hide the Dock (Ctrl+Shift+B brings it back)" aria-label="Hide Dock" style={{ height: 24, fontSize: 11 }}>
              Hide Dock
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingLauncher;
