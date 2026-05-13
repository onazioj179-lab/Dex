// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Time-based throttle (vs. rafThrottle's per-frame variant). Configurable
 * leading and trailing edge invocation. The returned function preserves the
 * latest argument set for trailing-edge calls.
 */

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

type AnyFn = (...args: unknown[]) => unknown;

export interface Throttled<F extends AnyFn> {
  (...args: Parameters<F>): void;
  cancel(): void;
  flush(): void;
}

export function throttle<F extends AnyFn>(
  fn: F,
  waitMs: number,
  opts: ThrottleOptions = {},
): Throttled<F> {
  const leading = opts.leading !== false;
  const trailing = opts.trailing !== false;
  let lastInvoke = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<F> | null = null;

  const invoke = (args: Parameters<F>): void => {
    lastInvoke = Date.now();
    pendingArgs = null;
    fn(...args);
  };

  const wrapped = ((...args: Parameters<F>) => {
    const now = Date.now();
    const elapsed = now - lastInvoke;
    pendingArgs = args;
    if (elapsed >= waitMs) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (leading) {
        invoke(args);
      } else {
        lastInvoke = now;
      }
    } else if (timer === null && trailing) {
      timer = setTimeout(() => {
        timer = null;
        if (pendingArgs) invoke(pendingArgs);
      }, waitMs - elapsed);
    }
  }) as Throttled<F>;

  wrapped.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingArgs = null;
    lastInvoke = 0;
  };

  wrapped.flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingArgs) invoke(pendingArgs);
  };

  return wrapped;
}

export function debounceFn<F extends AnyFn>(
  fn: F,
  waitMs: number,
): Throttled<F> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<F> | null = null;

  const invoke = (args: Parameters<F>): void => {
    pendingArgs = null;
    fn(...args);
  };

  const wrapped = ((...args: Parameters<F>) => {
    pendingArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (pendingArgs) invoke(pendingArgs);
    }, waitMs);
  }) as Throttled<F>;

  wrapped.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingArgs = null;
  };

  wrapped.flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingArgs) invoke(pendingArgs);
  };

  return wrapped;
}
