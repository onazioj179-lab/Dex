// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// The Morphing Dock. Collapsed it is one search button on its edge; expanded it
// is the Dock: pinned apps, the search/launcher button, and running apps that
// are not pinned. The button is the shared element: the Dock grows out of it
// (container transform) and the button never moves while it does.
//
// Pointer, touch and pen use one pointer-driven reorder (HTML5 drag does not
// work on touch); apps dragged in from the App Menu still drop in. Keyboard:
// arrows along the Dock, Home/End, Alt+arrow to reorder, Shift+F10 / Menu key
// for the app menu, Escape to collapse.

import { useUkiStore } from '../../store/ukiStore';
import { useUkiTasks } from '../../store/ukiTasksStore';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DexIcon from '../DexIcon';
import ContextMenu, { type ContextMenuItem } from '../ContextMenu';
import { APP_DEFINITIONS, useRunningApps } from '../../store/runningApps';
import { appPinning, useDockAppIds } from '../../services/appPinning';
import { openAppContextMenu, sendAppCommand } from '../AppContextMenu';
import { DEX_APP_DRAG_TYPE } from '../AppMenuPanel';
import { useDockStore, DOCK_TILE, DOCK_PAD, DOCK_THICKNESS, DOCK_MARGIN, dockReserve } from '../../store/dockStore';
import { computeWorkArea, isHorizontalDockEdge, placeDock, type WorkArea, type DockEdge } from '../../../shared/shell/workArea';
import { isReduceMotion, onReduceMotionChange } from '../../utils/MotionController';
import { dockLayout, dropIndex, moveTo, DOCK_GAP, DOCK_GROUP_GAP, DOCK_MOTION, DOCK_POSITIONS, dockPositionAt, type DockPosition } from './dockLayout';

const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD = 6;
const AUTO_COLLAPSE_MS = 1200;

/** Top of the content surface = height of the top bar. */
function measureTopBar(): number {
  const el = document.querySelector<HTMLElement>('[data-dex-content-surface]');
  return el ? Math.max(0, Math.round(el.getBoundingClientRect().top)) : 0;
}

function useViewport() {
  const [v, setV] = useState(() => ({ w: window.innerWidth, h: window.innerHeight, top: measureTopBar(), scale: window.devicePixelRatio || 1 }));
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setV({ w: window.innerWidth, h: window.innerHeight, top: measureTopBar(), scale: window.devicePixelRatio || 1 }));
    };
    window.addEventListener('resize', update);
    const el = document.querySelector('[data-dex-content-surface]');
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (el && ro) ro.observe(el);
    update();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', update); ro?.disconnect(); };
  }, []);
  return v;
}

function useReducedMotion(): boolean {
  const [r, setR] = useState(isReduceMotion);
  useEffect(() => onReduceMotionChange(setR), []);
  return r;
}

interface DragState {
  id: string;
  from: 'pinned' | 'running';
  pointerId: number;
  x: number;
  y: number;
  active: boolean;
  preview: string[] | null;
}

export interface MorphingDockProps {
  /** Opens the App Menu with its search field. */
  onOpenLauncher: () => void;
}

/** Within this distance of a screen edge a released Dock snaps to that edge.
 *  Tight on purpose: a wider band made the orb jump between fixed edge slots
 *  mid-drag, so sliding it along the bottom looked like it would not move. */
const EDGE_SNAP_PX = 28;
const clampTo = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
/** The edge position to snap to, or null to place the Dock freely here. */
function edgeSnapAt(area: WorkArea, x: number, y: number): DockPosition | null {
  const d = area.desktop;
  const near = Math.min(x - d.x, d.x + d.w - x, y - d.y, d.y + d.h - y);
  return near <= EDGE_SNAP_PX ? dockPositionAt(area, x, y) : null;
}

export const MorphingDock: React.FC<MorphingDockProps> = ({ onOpenLauncher }) => {
  const { edge: savedEdge, align: savedAlign, autoCollapse, expanded, setExpanded, setPrefs, free: savedFree } = useDockStore();
  const hidden = useDockStore(s => s.hiddenForFullscreen);
  const style = useDockStore(s => s.style);
  const pinnedIds = useDockAppIds();
  // UKI presence on the folded button: working (thinking, speaking, or a
  // background task running) / listening / awake / asleep (no ring).
  const ukiState = useUkiStore(st => st.state);
  const ukiTaskRunning = useUkiTasks(st => st.tasks.some(t => t.status === 'running'));
  const ukiRing: 'working' | 'listening' | 'awake' | null =
    ukiTaskRunning || ukiState === 'processing' || ukiState === 'thinking' || ukiState === 'speaking' ? 'working'
      : ukiState === 'listening' ? 'listening'
        : ukiState === 'idle' ? 'awake' : null;
  const runningApps = useRunningApps(s => s.runningApps);
  const currentId = useRunningApps(s => s.currentAppId);
  const vp = useViewport();
  const reduced = useReducedMotion();
  const [placementPreview, setPlacementPreview] = useState<DockPosition | null>(null);
  // Free placement: while dragging the Dock follows the pointer exactly (direct
  // manipulation, no easing); near a screen edge it snaps to that edge instead.
  const [freePreview, setFreePreview] = useState<{ x: number; y: number } | null>(null);
  const placementDrag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressTriggerClick = useRef(false);
  const freePx = placementPreview ? null
    : freePreview ?? (savedFree ? { x: savedFree.x * vp.w, y: savedFree.y * vp.h } : null);
  const { edge, align } = placementPreview
    ?? (freePx ? { edge: (freePx.y < vp.h / 2 ? 'top' : 'bottom') as DockEdge, align: 'center' as const } : { edge: savedEdge, align: savedAlign });
  const vertical = !isHorizontalDockEdge(edge);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);
  const rootRef = useRef<HTMLElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const longPress = useRef<ReturnType<typeof setTimeout>>();
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>();
  const suppressClick = useRef(false);

  const shownPinned = drag?.preview ?? pinnedIds;
  const runningIds = useMemo(
    () => runningApps.map(a => a.id).filter(id => id !== 'home' && !shownPinned.includes(id)),
    [runningApps, shownPinned],
  );

  // --- geometry -------------------------------------------------------------
  const area = useMemo(() => computeWorkArea({
    viewport: { width: vp.w, height: vp.h }, topBar: vp.top, scale: vp.scale,
    dock: { edge, reserve: freePx ? 0 : dockReserve({ style: 'morphing', hiddenForFullscreen: hidden }), margin: DOCK_MARGIN },
  }), [vp, edge, hidden, freePx]);

  const layout = dockLayout(shownPinned.length, runningIds.length);
  // On a short edge the two groups share what is left; each scrolls.
  const fixed = DOCK_PAD * 2 + DOCK_TILE + (layout.pinnedLen ? DOCK_GROUP_GAP : 0) + (layout.runningLen ? DOCK_GROUP_GAP : 0);
  const room = Math.max(0, area.dockMaxLength - fixed);
  let pinnedVis = layout.pinnedLen;
  let runningVis = layout.runningLen;
  if (pinnedVis + runningVis > room) {
    pinnedVis = Math.min(layout.pinnedLen, Math.max(room / 2, room - layout.runningLen));
    runningVis = Math.min(layout.runningLen, room - pinnedVis);
  }
  const expandedLen = fixed + pinnedVis + runningVis;
  const triggerCenter = DOCK_PAD + (layout.pinnedLen ? pinnedVis + DOCK_GROUP_GAP : 0) + DOCK_TILE / 2;
  const collapsedLen = layout.collapsedLen;
  const axisStart = vertical ? area.desktop.y : 0;
  const axisLength = vertical ? area.desktop.h : area.desktop.w;
  const anchor = axisStart + (align === 'start' ? 0 : align === 'end' ? axisLength : axisLength / 2);
  const open = expanded || !!drag?.active;
  const placed = placeDock(area, edge, open ? expandedLen : collapsedLen, anchor, DOCK_MARGIN);
  // Collapsed, the track slides so its trigger sits in the middle of the button.
  const trackShift = open ? 0 : -(triggerCenter - collapsedLen / 2);

  // Collapse runs a little faster than expand; reduced motion = no movement.
  const ms = reduced ? 0 : (open ? DOCK_MOTION.expandMs : DOCK_MOTION.collapseMs);
  const ease = DOCK_MOTION.easing;
  const geomTransition = drag?.active || placementPreview || freePreview
    ? 'none'
    : ['left', 'top', 'width', 'height', 'border-radius'].map(p => `${p} ${ms}ms ${ease}`).join(', ');
  const fadeMs = reduced ? 0 : open ? 160 : 90;
  const fadeDelay = reduced || !open ? 0 : Math.round(DOCK_MOTION.expandMs * 0.35);

  // Free: the folded button sits where it was dropped; opening grows sideways
  // from it (the button stays under the pointer), always kept fully on screen.
  const freeLen = open ? expandedLen : collapsedLen;
  const freeOuter: React.CSSProperties | null = freePx ? {
    left: Math.round(clampTo(freePx.x - (open ? triggerCenter : collapsedLen / 2), DOCK_MARGIN, vp.w - freeLen - DOCK_MARGIN)),
    top: Math.round(clampTo(freePx.y - DOCK_THICKNESS / 2, area.desktop.y + DOCK_MARGIN, vp.h - DOCK_THICKNESS - DOCK_MARGIN)),
    width: freeLen, height: DOCK_THICKNESS,
  } : null;
  const outer: React.CSSProperties = freeOuter ?? (!vertical
    ? { left: placed.start, [edge]: edge === 'top' ? area.desktop.y + DOCK_MARGIN : DOCK_MARGIN, width: placed.length, height: DOCK_THICKNESS }
    : { top: placed.start, [edge]: DOCK_MARGIN, width: DOCK_THICKNESS, height: placed.length } as React.CSSProperties);

  // --- collapse rules ---------------------------------------------------------
  const collapse = useCallback((focusTrigger = false) => {
    setExpanded(false);
    if (focusTrigger) requestAnimationFrame(() => triggerRef.current?.focus());
  }, [setExpanded]);

  useEffect(() => {
    if (!autoCollapse || !expanded) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node) || menu) return;
      collapse();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [autoCollapse, expanded, menu, collapse]);

  useEffect(() => () => { clearTimeout(collapseTimer.current); clearTimeout(longPress.current); }, []);

  const onPointerLeave = () => {
    if (!autoCollapse || !expanded || drag || menu || placementDrag.current) return;
    clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => collapse(), AUTO_COLLAPSE_MS);
  };
  const onPointerEnter = () => clearTimeout(collapseTimer.current);

  // --- actions ---------------------------------------------------------------
  const launch = (id: string) => {
    const run = runningApps.find(a => a.id === id);
    sendAppCommand(id, run ? 'front' : 'open');
    if (autoCollapse) collapse();
  };

  const onTrigger = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressTriggerClick.current) {
      suppressTriggerClick.current = false;
      if (event.detail > 0) return;
    }
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!expanded) { setExpanded(true); return; }
    onOpenLauncher();
    if (autoCollapse) collapse();
  };

  const startPlacementDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!e.isPrimary || e.button !== 0) return;
    const trigger = triggerRef.current;
    const fromTrigger = trigger?.contains(e.target as Node);
    if (!fromTrigger && (expanded || (e.target as Element).closest('button'))) return;
    clearTimeout(collapseTimer.current);
    suppressTriggerClick.current = false;
    placementDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    ((fromTrigger && trigger) || e.currentTarget).setPointerCapture(e.pointerId);
  };
  const movePlacementDrag = (e: React.PointerEvent<HTMLElement>) => {
    const pointer = placementDrag.current;
    if (!pointer || pointer.id !== e.pointerId) return;
    if (!pointer.moved && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) < DRAG_THRESHOLD) return;
    pointer.moved = true;
    // Direct manipulation: the Dock follows the pointer the whole way; the
    // edge snap is applied on release (it then glides into place).
    setPlacementPreview(null);
    setFreePreview({ x: e.clientX, y: e.clientY });
  };
  // Esc abandons a placement drag: the Dock returns to where it was.
  const placing = !!placementPreview || !!freePreview;
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !placementDrag.current) return;
      e.preventDefault();
      e.stopPropagation();
      placementDrag.current = null;
      suppressTriggerClick.current = true;
      setPlacementPreview(null);
      setFreePreview(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [placing]);
  const endPlacementDrag = (e: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const pointer = placementDrag.current;
    if (!pointer || pointer.id !== e.pointerId) return;
    placementDrag.current = null;
    setPlacementPreview(null);
    setFreePreview(null);
    if (commit && (pointer.moved || Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) >= DRAG_THRESHOLD)) {
      suppressTriggerClick.current = true;
      const snap = edgeSnapAt(area, e.clientX, e.clientY);
      if (snap) setPrefs({ ...snap, free: null });
      else setPrefs({ free: { x: e.clientX / Math.max(1, vp.w), y: e.clientY / Math.max(1, vp.h) } });
    }
  };

  // --- pointer drag (mouse, touch, pen) ---------------------------------------
  const axisPos = (e: { clientX: number; clientY: number }) => (vertical ? e.clientY : e.clientX);
  const pinnedIndexAt = (e: { clientX: number; clientY: number }, count: number): number | null => {
    const g = pinnedRef.current;
    const root = rootRef.current;
    if (!g || !root) return null;
    const r = root.getBoundingClientRect();
    const inDock = vertical
      ? e.clientX >= r.left - 40 && e.clientX <= r.right + 40
      : e.clientY >= r.top - 40 && e.clientY <= r.bottom + 40;
    if (!inDock) return null;
    const gr = g.getBoundingClientRect();
    const scroll = vertical ? g.scrollTop : g.scrollLeft;
    const pos = axisPos(e) - (vertical ? gr.top : gr.left) + scroll - DOCK_TILE / 2;
    return dropIndex(pos, count);
  };

  const onTilePointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: string, from: 'pinned' | 'running') => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, from, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false, preview: null });
    if (e.pointerType !== 'mouse') {
      const { clientX, clientY } = e;
      clearTimeout(longPress.current);
      longPress.current = setTimeout(() => {
        suppressClick.current = true;
        setDrag(null);
        openAppContextMenu({ appId: id, x: clientX, y: clientY, source: 'dock' });
      }, LONG_PRESS_MS);
    }
  };

  const onTilePointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.active && moved < DRAG_THRESHOLD) return;
    clearTimeout(longPress.current);
    if (drag.from === 'running' && !appPinning.canPin(drag.id)) return;
    const base = pinnedIds.filter(x => x !== drag.id);
    const idx = pinnedIndexAt(e, base.length);
    const preview = idx === null
      ? (drag.from === 'pinned' ? pinnedIds : null)
      : moveTo(base, drag.id, idx);
    setDrag({ ...drag, active: true, preview });
  };

  const onTilePointerUp = (e: React.PointerEvent) => {
    clearTimeout(longPress.current);
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.active) {
      suppressClick.current = true;
      const p = drag.preview;
      if (p && p.includes(drag.id)) {
        const before = p[p.indexOf(drag.id) + 1] ?? null;
        const wasPinned = appPinning.isPinned('dock', drag.id);
        appPinning.place('dock', drag.id, before);
        if (!wasPinned) toast(`Pinned ${APP_DEFINITIONS[drag.id]?.name ?? drag.id} to the Dock`);
      }
    }
    setDrag(null);
  };

  const onTileClick = (id: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    launch(id);
  };

  // --- HTML5 drop from the App Menu -------------------------------------------
  const isDexDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DEX_APP_DRAG_TYPE);
  const onDragOver = (e: React.DragEvent) => {
    if (!isDexDrag(e)) return;
    e.preventDefault();
    if (!expanded) setExpanded(true);
    const idx = pinnedIndexAt(e, pinnedIds.length);
    setDropBefore(idx === null ? undefined : pinnedIds[idx] ?? null);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!isDexDrag(e)) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(DEX_APP_DRAG_TYPE);
    const before = dropBefore === undefined ? null : dropBefore;
    setDropBefore(undefined);
    if (!id || !appPinning.canPin(id)) return;
    const wasPinned = appPinning.isPinned('dock', id);
    appPinning.place('dock', id, before === id ? null : before);
    if (!wasPinned) toast(`Pinned ${APP_DEFINITIONS[id]?.name ?? id} to the Dock`);
  };

  // --- keyboard -----------------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (expanded) { e.preventDefault(); collapse(true); }
      return;
    }
    const btns = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('button[data-dock-item]') ?? []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    const id = btns[i].dataset.dockItem!;
    if (e.altKey && (e.key === prevKey || e.key === nextKey) && pinnedIds.includes(id)) {
      e.preventDefault();
      const at = pinnedIds.indexOf(id) + (e.key === prevKey ? -1 : 1);
      if (at < 0 || at >= pinnedIds.length) return;
      appPinning.place('dock', id, moveTo(pinnedIds, id, at)[at + 1] ?? null);
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(`button[data-dock-item="${id}"]`)?.focus());
      return;
    }
    let to = -1;
    if (e.key === nextKey) to = Math.min(i + 1, btns.length - 1);
    else if (e.key === prevKey) to = Math.max(i - 1, 0);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = btns.length - 1;
    if (to >= 0) { e.preventDefault(); btns[to].focus(); return; }
    if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
      e.preventDefault();
      const r = btns[i].getBoundingClientRect();
      if (id === '__trigger') setMenu({ x: r.left, y: r.top });
      else openAppContextMenu({ appId: id, x: r.left, y: r.top - 8, source: 'dock' });
    }
  };

  // Roving tab stop: one Tab into the Dock, arrows inside it.
  const [focusId, setFocusId] = useState('__trigger');
  useLayoutEffect(() => {
    if (focusId !== '__trigger' && !shownPinned.includes(focusId) && !runningIds.includes(focusId)) setFocusId('__trigger');
  }, [focusId, shownPinned, runningIds]);

  if (style !== 'morphing') return null;

  const groupStyle = (len: number): React.CSSProperties => ({
    display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: DOCK_GAP, flexShrink: 0,
    [vertical ? 'height' : 'width']: len, [vertical ? 'overflowY' : 'overflowX']: 'auto',
    scrollbarWidth: 'none', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
    transition: `opacity ${fadeMs}ms ${ease} ${fadeDelay}ms`,
  } as React.CSSProperties);

  const tile = (id: string, group: 'pinned' | 'running') => {
    const def = APP_DEFINITIONS[id];
    const run = runningApps.find(a => a.id === id);
    const isCurrent = currentId === id && !!run && !run.isMinimized;
    const name = def?.name ?? id;
    return (
      <button
        key={id}
        type="button"
        className="dex-mdock-tile"
        data-dock-item={id}
        data-group={group}
        data-current={isCurrent || undefined}
        data-dragging={drag?.active && drag.id === id ? 'true' : undefined}
        data-drop-before={dropBefore === id ? 'true' : undefined}
        tabIndex={open && focusId === id ? 0 : -1}
        aria-label={`${name}${run ? (run.isMinimized ? ', minimized' : ', running') : ''}`}
        aria-pressed={isCurrent}
        title={name}
        onFocus={() => setFocusId(id)}
        onClick={() => onTileClick(id)}
        onContextMenu={e => { e.preventDefault(); openAppContextMenu({ appId: id, x: e.clientX, y: e.clientY, source: 'dock' }); }}
        onPointerDown={e => onTilePointerDown(e, id, group)}
        onPointerMove={onTilePointerMove}
        onPointerUp={onTilePointerUp}
        onPointerCancel={() => { clearTimeout(longPress.current); setDrag(null); }}
      >
        <DexIcon name={def?.icon || id} size={22} color="currentColor" />
        {run && <span aria-hidden="true" className="dex-mdock-dot" data-minimized={run.isMinimized || undefined} />}
      </button>
    );
  };

  const triggerMenu: ContextMenuItem[] = [
    { id: 'toggle', label: expanded ? 'Collapse Dock' : 'Expand Dock', onClick: () => (expanded ? collapse(true) : setExpanded(true)) },
    { id: 'launcher', label: 'Search apps', onClick: onOpenLauncher, dividerAfter: true },
    ...DOCK_POSITIONS.map(position => ({
      id: 'position-' + position.edge + '-' + position.align,
      label: (savedEdge === position.edge && savedAlign === position.align ? '✓ ' : '') + 'Position: ' + position.label,
      onClick: () => setPrefs({ edge: position.edge, align: position.align }),
    })),
    { id: 'auto', label: `${autoCollapse ? '✓ ' : ''}Collapse automatically`, onClick: () => useDockStore.getState().setPrefs({ autoCollapse: !autoCollapse }) },
  ];

  return (
    <>
      <style>{DOCK_CSS}</style>
      <nav
        ref={rootRef}
        className="dex-mdock"
        aria-label="Dock"
        data-edge={edge}
        data-align={align}
        data-free={freePx ? 'true' : undefined}
        data-axis={vertical ? 'vertical' : 'horizontal'}
        data-state={open ? 'expanded' : 'collapsed'}
        data-hidden={hidden || undefined}
        onKeyDown={onKeyDown}
        onPointerDown={startPlacementDrag}
        onPointerMove={movePlacementDrag}
        onPointerUp={e => endPlacementDrag(e, true)}
        onPointerCancel={e => endPlacementDrag(e, false)}
        onLostPointerCapture={e => endPlacementDrag(e, false)}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onDragOver={onDragOver}
        onDragLeave={() => setDropBefore(undefined)}
        onDrop={onDrop}
        style={{
          ...outer,
          borderRadius: open ? 18 : DOCK_THICKNESS / 2,
          transition: geomTransition,
        }}
      >
        <div
          className="dex-mdock-track"
          style={{
            display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center',
            padding: DOCK_PAD, gap: 0,
            // Same property family and thread as the container's own left/top,
            // so the two stay frame-locked and the trigger never drifts.
            ...(vertical ? { top: trackShift } : { left: trackShift }),
            transition: drag?.active ? 'none' : `${vertical ? 'top' : 'left'} ${ms}ms ${ease}`,
          }}
        >
          {layout.pinnedLen > 0 && (
            <>
              <div ref={pinnedRef} role="group" aria-label="Pinned apps" style={groupStyle(pinnedVis)}>
                {shownPinned.map(id => tile(id, 'pinned'))}
              </div>
              <span aria-hidden="true" className="dex-mdock-sep" style={{ opacity: open ? 1 : 0, transition: `opacity ${fadeMs}ms ${ease} ${fadeDelay}ms` }} />
            </>
          )}
          <button
            ref={triggerRef}
            type="button"
            className="dex-mdock-tile dex-mdock-trigger"
            data-dock-item="__trigger"
            tabIndex={!open || focusId === '__trigger' ? 0 : -1}
            aria-label={(open ? 'Search apps' : 'Open Dock') + (ukiRing === 'working' ? ', UKI is working' : ukiRing === 'listening' ? ', UKI is listening' : '')}
            aria-expanded={open}
            data-uki={ukiRing ?? undefined}
            onFocus={() => setFocusId('__trigger')}
            onClick={onTrigger}
            onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
          >
            <DexIcon name="search" size={20} color="currentColor" />
            {ukiRing && <span className="dex-mdock-uki" aria-hidden="true" data-state={ukiRing} />}
          </button>
          {layout.runningLen > 0 && (
            <>
              <span aria-hidden="true" className="dex-mdock-sep" style={{ opacity: open ? 1 : 0, transition: `opacity ${fadeMs}ms ${ease} ${fadeDelay}ms` }} />
              <div role="group" aria-label="Running apps" style={groupStyle(runningVis)}>
                {runningIds.map(id => tile(id, 'running'))}
              </div>
            </>
          )}
        </div>
      </nav>
      {menu && <ContextMenu items={triggerMenu} position={menu} onClose={() => setMenu(null)} />}
    </>
  );
};

function toast(message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message } })); } catch { /* non-DOM */ }
}

const DOCK_CSS = `
:where(.dex-mdock) {
  position: fixed; z-index: 9000; touch-action: none; overflow: hidden; box-sizing: border-box;
  /* DEX Blue Modern: a restrained blue tint in the glass, a hairline rim. */
  background: color-mix(in srgb, var(--color-accent) 6%, var(--color-bg-elevated));
  border: 1px solid color-mix(in srgb, var(--color-accent) 14%, var(--color-border-subtle));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  :where(.dex-mdock) {
    background: color-mix(in srgb, var(--color-accent) 7%, var(--glass-bg, var(--color-bg-elevated)));
    backdrop-filter: var(--glass-blur, blur(20px) saturate(1.4));
    -webkit-backdrop-filter: var(--glass-blur, blur(20px) saturate(1.4));
  }
}
:where(.dex-mdock)[data-hidden] { opacity: 0; pointer-events: none; }
:where(.dex-mdock) :where(.dex-mdock-track) { position: absolute; left: 0; top: 0; }
:where(.dex-mdock[data-axis="horizontal"]) :where(.dex-mdock-track) { height: 100%; }
:where(.dex-mdock[data-axis="vertical"]) :where(.dex-mdock-track) { width: 100%; }
:where(.dex-mdock) :where(.dex-mdock-tile) {
  position: relative; flex-shrink: 0; width: ${DOCK_TILE}px; height: ${DOCK_TILE}px; padding: 0;
  display: flex; align-items: center; justify-content: center; border: none; border-radius: 10px;
  background: transparent; color: var(--color-text-secondary); cursor: pointer; touch-action: none;
  transition: background 120ms ease, color 120ms ease, opacity 120ms ease;
}
:where(.dex-mdock) :where(.dex-mdock-tile):hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
:where(.dex-mdock) :where(.dex-mdock-tile)[data-current] { background: var(--color-bg-active, var(--color-bg-hover)); color: var(--color-text-primary); }
:where(.dex-mdock) :where(.dex-mdock-tile)[data-dragging] { opacity: 0.55; }
:where(.dex-mdock) :where(.dex-mdock-tile)[data-drop-before] { box-shadow: inset 2px 0 0 var(--color-accent); }
:where(.dex-mdock) :where(.dex-mdock-trigger) { color: var(--color-accent); position: relative; }
/* UKI ring around the search button: a turning accent arc while UKI works,
   a solid ring while it listens, a faint ring while it is awake. */
:where(.dex-mdock) .dex-mdock-uki {
  position: absolute; inset: -3px; border-radius: 9999px; pointer-events: none;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
}
:where(.dex-mdock) .dex-mdock-uki[data-state="awake"] { background: color-mix(in srgb, var(--color-accent) 35%, transparent); }
:where(.dex-mdock) .dex-mdock-uki[data-state="listening"] { background: var(--color-accent); }
:where(.dex-mdock) .dex-mdock-uki[data-state="working"] {
  background: conic-gradient(from 0deg, transparent 0 35%, var(--color-accent) 75%, transparent 100%);
  animation: dex-mdock-uki-turn 1.1s linear infinite;
}
@keyframes dex-mdock-uki-turn { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  :where(.dex-mdock) .dex-mdock-uki[data-state="working"] { animation: none; background: var(--color-accent); }
}
:where(.dex-mdock) :where(.dex-mdock-sep) { flex-shrink: 0; background: var(--color-border-subtle); }
:where(.dex-mdock[data-axis="horizontal"]) :where(.dex-mdock-sep) { width: 1px; height: 22px; margin: 0 ${(DOCK_GROUP_GAP - 1) / 2}px; }
:where(.dex-mdock[data-axis="vertical"]) :where(.dex-mdock-sep) { height: 1px; width: 22px; margin: ${(DOCK_GROUP_GAP - 1) / 2}px 0; }
:where(.dex-mdock) :where(.dex-mdock-dot) { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: var(--color-text-secondary); }
:where(.dex-mdock) :where(.dex-mdock-tile)[data-current] :where(.dex-mdock-dot) { background: var(--color-accent); }
:where(.dex-mdock) :where(.dex-mdock-dot)[data-minimized] { opacity: 0.5; }
:where(.dex-mdock[data-edge="bottom"]) :where(.dex-mdock-dot) { bottom: 1px; left: calc(50% - 2px); }
:where(.dex-mdock[data-edge="top"]) :where(.dex-mdock-dot) { top: 1px; left: calc(50% - 2px); }
:where(.dex-mdock[data-edge="left"]) :where(.dex-mdock-dot) { left: 1px; top: calc(50% - 2px); }
:where(.dex-mdock[data-edge="right"]) :where(.dex-mdock-dot) { right: 1px; top: calc(50% - 2px); }
@media (prefers-reduced-motion: reduce) {
  :where(.dex-mdock), :where(.dex-mdock) * { transition-duration: 0ms !important; }
}
`;

export default MorphingDock;
