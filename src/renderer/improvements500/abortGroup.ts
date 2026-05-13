// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AbortSignal combinator. Returns a single AbortSignal that aborts as soon
 * as any input signal aborts. Useful for "any-of" cancellation across
 * timeouts, user cancels, and parent scopes.
 */

export interface AbortGroupResult {
  signal: AbortSignal;
  cancel(reason?: unknown): void;
}

export function combineAbortSignals(signals: ReadonlyArray<AbortSignal | undefined | null>): AbortGroupResult {
  const ctrl = new AbortController();
  const cleanups: Array<() => void> = [];

  const onAbort = (reason: unknown): void => {
    if (!ctrl.signal.aborted) ctrl.abort(reason);
    for (const c of cleanups) c();
    cleanups.length = 0;
  };

  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      onAbort((s as AbortSignal & { reason?: unknown }).reason);
      break;
    }
    const handler = (): void => onAbort((s as AbortSignal & { reason?: unknown }).reason);
    s.addEventListener('abort', handler, { once: true });
    cleanups.push(() => s.removeEventListener('abort', handler));
  }

  return {
    signal: ctrl.signal,
    cancel: (reason?: unknown) => onAbort(reason),
  };
}

/** Promise rejected when the supplied signal aborts. */
export function abortPromise(signal: AbortSignal): Promise<never> {
  if (signal.aborted) {
    return Promise.reject((signal as AbortSignal & { reason?: unknown }).reason ?? new Error('aborted'));
  }
  return new Promise<never>((_, reject) => {
    signal.addEventListener(
      'abort',
      () => reject((signal as AbortSignal & { reason?: unknown }).reason ?? new Error('aborted')),
      { once: true },
    );
  });
}
