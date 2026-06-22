// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Leak-safe timer + animation-frame hooks.
 *
 * Long-lived DEX apps leak when an interval/timeout/rAF outlives its component
 * because cleanup was forgotten. These hooks own the lifecycle: the callback is
 * kept in a ref (so it never goes stale and changing it does NOT reset the
 * timer), and the timer is always cleared on unmount or when paused. Passing a
 * `null` delay pauses the interval/timeout without tearing the component down.
 */

import { useEffect, useRef } from 'react';

/** Run `callback` every `delay` ms. `null` delay pauses. Auto-clears on unmount. */
export function useInterval(callback: () => void, delay: number | null): void {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(() => { saved.current(); }, delay);
    return () => clearInterval(id);
  }, [delay]);
}

/** Fire `callback` once after `delay` ms. `null` delay disarms. Auto-clears. */
export function useTimeout(callback: () => void, delay: number | null): void {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    if (delay == null) return;
    const id = setTimeout(() => { saved.current(); }, delay);
    return () => clearTimeout(id);
  }, [delay]);
}

/**
 * Drive `callback(deltaMs, now)` on requestAnimationFrame while `active`.
 * Cancels on unmount or when `active` goes false. The callback ref stays fresh
 * without restarting the loop.
 */
export function useAnimationFrame(
  callback: (deltaMs: number, now: number) => void,
  active = true,
): void {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    if (!active || typeof requestAnimationFrame !== 'function') return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      saved.current(dt, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

/**
 * Subscribe to a window/document/element event with automatic removal. Keeps the
 * handler in a ref so re-renders don't re-bind. Returns nothing; cleans up on
 * unmount or when the target/event changes.
 */
export function useEventListener<K extends keyof WindowEventMap>(
  event: K,
  handler: (ev: WindowEventMap[K]) => void,
  target: Window | Document | HTMLElement | null = typeof window !== 'undefined' ? window : null,
): void {
  const saved = useRef(handler);
  useEffect(() => { saved.current = handler; }, [handler]);
  useEffect(() => {
    if (!target || typeof target.addEventListener !== 'function') return;
    const listener = (ev: Event) => saved.current(ev as WindowEventMap[K]);
    target.addEventListener(event, listener);
    return () => target.removeEventListener(event, listener);
  }, [event, target]);
}
