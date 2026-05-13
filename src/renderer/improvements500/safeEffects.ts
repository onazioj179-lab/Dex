// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Leak-safe React effect helpers (T6-029, T6-030, T6-032, T6-015).
 *
 * Encapsulates the cleanup pattern for timers, listeners, rAF, and fetches
 * so callers cannot forget the teardown.
 */

import { useEffect, useRef, useState } from 'react';

export function useTimeout(fn: () => void, delayMs: number | null): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (delayMs == null) return;
    const id = setTimeout(() => fnRef.current(), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);
}

export function useInterval(fn: () => void, intervalMs: number | null): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (intervalMs == null) return;
    const id = setInterval(() => fnRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

export function useEventListener<K extends keyof WindowEventMap>(
  event: K,
  handler: (ev: WindowEventMap[K]) => void,
  target: Window | Document | HTMLElement | null = typeof window === 'undefined' ? null : window,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!target) return;
    const wrapped = (e: Event) => handlerRef.current(e as WindowEventMap[K]);
    target.addEventListener(event, wrapped);
    return () => target.removeEventListener(event, wrapped);
  }, [event, target]);
}

export function useRaf(fn: (dtMs: number) => void, enabled = true): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled || typeof requestAnimationFrame === 'undefined') return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      fnRef.current(now - prev);
      prev = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}

export interface FetchState<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

/** fetch wrapper that auto-aborts on unmount or url change. */
export function useFetchJson<T>(url: string | null, init?: RequestInit): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ loading: !!url });
  useEffect(() => {
    if (!url) { setState({ loading: false }); return; }
    const ctrl = new AbortController();
    setState({ loading: true });
    fetch(url, { ...init, signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<T>;
      })
      .then((data) => setState({ data, loading: false }))
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setState({ error: err as Error, loading: false });
      });
    return () => ctrl.abort();
  }, [url, init]);
  return state;
}

/** Visibility hook (T6-026, T6-027): returns true when document is visible. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(typeof document === 'undefined' ? true : !document.hidden);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/** Debounce a value (T6-017). */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return v;
}
