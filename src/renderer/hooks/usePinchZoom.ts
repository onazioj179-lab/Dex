// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * usePinchZoom: smooth zoom for any viewer surface.
 *   - trackpad pinch (arrives as Ctrl+wheel on Windows) and Ctrl+wheel:
 *     continuous, proportional to the gesture;
 *   - plain mouse wheel: gentle steps;
 *   - touch: two-finger pinch.
 * The wheel listener is non-passive (React's onWheel is passive, so its
 * preventDefault could not stop the WebView from zooming the whole page).
 * The element is marked data-own-gestures so the workspace never takes them.
 */
import { useEffect, useRef } from 'react';

export interface PinchZoomOptions {
  min: number;
  max: number;
  /** Read the current zoom (called per event, so it always sees the latest). */
  get: () => number;
  set: (zoom: number) => void;
  /** Plain-wheel zoom (default true). Off for surfaces where the wheel scrolls. */
  wheel?: boolean;
  enabled?: boolean;
  /** Re-attach when this changes (e.g. the shown item, if the surface remounts). */
  key?: string | number;
}

export function zoomForWheel(current: number, deltaY: number, deltaMode: number, pinch: boolean, min: number, max: number): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  const k = pinch ? 0.01 : 0.0015;
  const next = current * Math.exp(-deltaY * unit * k);
  return Math.min(max, Math.max(min, next));
}

export function usePinchZoom(ref: React.RefObject<HTMLElement>, opts: PinchZoomOptions): void {
  const o = useRef(opts);
  o.current = opts;
  const enabled = opts.enabled ?? true;
  const key = opts.key;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    el.setAttribute('data-own-gestures', '');
    const onWheel = (e: WheelEvent) => {
      const { min, max, get, set, wheel = true } = o.current;
      if (!e.ctrlKey && !wheel) return;
      e.preventDefault();
      e.stopPropagation();
      set(zoomForWheel(get(), e.deltaY, e.deltaMode, e.ctrlKey, min, max));
    };
    // Two-finger touch pinch.
    const touches = new Map<number, { x: number; y: number }>();
    let startDist = 0;
    let startZoom = 1;
    const dist = () => {
      const [a, b] = [...touches.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { startDist = dist(); startZoom = o.current.get(); }
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2 || startDist < 10) return;
      e.preventDefault();
      const { min, max, set } = o.current;
      set(Math.min(max, Math.max(min, startZoom * (dist() / startDist))));
    };
    const up = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) startDist = 0; };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move, { passive: false });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [ref, enabled, key]);
}
