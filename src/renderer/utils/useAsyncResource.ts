// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX — useAsyncResource
 * ===========================================================================
 * Standardizes the "load with timeout + loading + error + reload" pattern that
 * data-backed apps (Audio, Uki, Gallery, ...) currently hand-roll: a mounted
 * flag, a Promise.race against a setTimeout, a try/catch that surfaces an error
 * string, and a cleanup that avoids setState-after-unmount.
 *
 * The hook owns:
 *   - an AbortController per run, aborted on unmount and on deps change so a
 *     slow loader can bail early (pass the signal to fetch / dexInvoke);
 *   - a timeout (default 5000ms) that rejects with a clear, named Error;
 *   - a `reload()` that re-runs the loader on demand;
 *   - a "never set state after unmount" guard.
 *
 * Background enrichment (the Audio pattern where the first batch loads fast and
 * the rest fill in later) stays in the loader: resolve with the fast result,
 * then push enriched data through your own state. This hook intentionally only
 * owns the primary load so it stays small and predictable.
 *
 * Dependency-free (only `react`).
 *
 * Usage — loading media files with a timeout:
 *
 *   const { data, loading, error, reload } = useAsyncResource<Track[]>(
 *     async (signal) => {
 *       const files = await window.dex?.invoke('media:getMediaFiles', 'music');
 *       if (signal.aborted) return [];
 *       return (files ?? []).map(toTrack);
 *     },
 *     { timeoutMs: 3000 },
 *   );
 *
 *   if (loading) return <Spinner />;
 *   if (error)   return <ErrorState message={error.message} onRetry={reload} />;
 *   return <TrackList tracks={data ?? []} />;
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAsyncResourceOptions {
  /** Reject the load if it has not settled within this many ms. Default 5000. */
  timeoutMs?: number;
  /**
   * Values that re-trigger the loader when their identity changes. Same
   * contract as a `useEffect` dependency array. Defaults to `[]` (load once).
   */
  deps?: unknown[];
  /**
   * When false, the loader is not run and state stays idle (`loading: false`,
   * `data: null`). Flip to true to kick off the load. Default true.
   */
  enabled?: boolean;
}

export interface AsyncResource<T> {
  /** Last successful result, or null before the first success. */
  data: T | null;
  /** True while a load is in flight. */
  loading: boolean;
  /** The error from the most recent failed/timed-out load, else null. */
  error: Error | null;
  /** Re-run the loader. Aborts any in-flight run first. */
  reload: () => void;
}

/** Thrown when a loader does not settle within `timeoutMs`. */
export class AsyncResourceTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Async resource timed out after ${timeoutMs}ms`);
    this.name = 'AsyncResourceTimeoutError';
  }
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Load an async resource with a timeout, loading/error state, abort-on-unmount,
 * and an on-demand `reload`. See the file header for usage.
 *
 * @param loader Receives an AbortSignal; resolve with the data or reject. The
 *   signal aborts on unmount, on a deps change, and when `reload` is called, so
 *   honor it (pass it to fetch / a cancelable IPC call, or check `signal.aborted`).
 * @param opts   timeoutMs, deps, enabled.
 */
export function useAsyncResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  opts: UseAsyncResourceOptions = {},
): AsyncResource<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, deps = [], enabled = true } = opts;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Latest loader, read through a ref so a fresh closure on every render does
  // not, by itself, re-run the load — only `deps`/`enabled`/`reload` do.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // True only while this component is mounted; gates every setState.
  const mountedRef = useRef(false);
  // The controller for the run currently in flight, so reload/unmount can abort.
  const controllerRef = useRef<AbortController | null>(null);
  // Bumped by reload() to force the effect to re-run.
  const [nonce, setNonce] = useState(0);

  const run = useCallback(() => {
    // Cancel any in-flight run before starting a new one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setError(null);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new AsyncResourceTimeoutError(timeoutMs));
      }, timeoutMs);
    });

    Promise.race([loaderRef.current(signal), timeoutPromise])
      .then((result) => {
        if (signal.aborted || !mountedRef.current) return;
        setData(result as T);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        // An abort from unmount/deps-change/reload is expected — drop it.
        if (signal.aborted || !mountedRef.current) return;
        if (err instanceof AsyncResourceTimeoutError) controller.abort();
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  }, [timeoutMs]);

  const reload = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Disabled: cancel any in-flight load and present an idle state.
      controllerRef.current?.abort();
      setLoading(false);
      return;
    }
    run();
    return () => {
      controllerRef.current?.abort();
    };
    // `deps` is spread so callers control re-runs; `nonce` drives reload();
    // `enabled`/`run` complete the dependency set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, run, ...deps]);

  return { data, loading, error, reload };
}

export default useAsyncResource;
