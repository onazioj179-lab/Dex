// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * "Latest-wins" async debounce: returns a function that schedules the wrapped
 * async fn and resolves all callers within the debounce window with the
 * result of the LAST scheduled invocation. Earlier callers do not race.
 */

export interface DebouncedAsync<A extends unknown[], R> {
  (...args: A): Promise<R>;
  cancel(): void;
}

export function debouncePromise<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  waitMs: number,
): DebouncedAsync<A, R> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingResolves: Array<(v: R) => void> = [];
  let pendingRejects: Array<(e: unknown) => void> = [];
  let lastArgs: A | null = null;

  const debounced = ((...args: A): Promise<R> => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    return new Promise<R>((resolve, reject) => {
      pendingResolves.push(resolve);
      pendingRejects.push(reject);
      timer = setTimeout(() => {
        timer = null;
        const argsToUse = lastArgs!;
        const resolves = pendingResolves;
        const rejects = pendingRejects;
        pendingResolves = [];
        pendingRejects = [];
        lastArgs = null;
        fn(...argsToUse).then(
          (r) => { for (const f of resolves) f(r); },
          (e) => { for (const f of rejects) f(e); },
        );
      }, waitMs);
    });
  }) as DebouncedAsync<A, R>;

  debounced.cancel = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    const rejects = pendingRejects;
    pendingResolves = [];
    pendingRejects = [];
    lastArgs = null;
    const err = new Error('debouncePromise: cancelled');
    for (const f of rejects) f(err);
  };

  return debounced;
}
