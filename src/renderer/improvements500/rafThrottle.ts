// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * requestAnimationFrame throttle (T6 perf, T11 pinch / pan handlers).
 *
 * Coalesces high-frequency callers (pointer move, wheel) into one call per
 * frame, always passing the latest args.
 */

type AnyFn = (...args: unknown[]) => void;

export function rafThrottle<F extends AnyFn>(fn: F): F & { cancel: () => void } {
  let scheduled = false;
  let lastArgs: Parameters<F> | null = null;
  let handle = 0;
  const raf = typeof requestAnimationFrame !== 'undefined'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback): number => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  const caf = typeof cancelAnimationFrame !== 'undefined'
    ? cancelAnimationFrame
    : (h: number): void => clearTimeout(h as unknown as ReturnType<typeof setTimeout>);

  const wrapped = ((...args: Parameters<F>): void => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    handle = raf(() => {
      scheduled = false;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    });
  }) as F & { cancel: () => void };

  wrapped.cancel = (): void => {
    if (scheduled) caf(handle);
    scheduled = false;
    lastArgs = null;
  };

  return wrapped;
}
