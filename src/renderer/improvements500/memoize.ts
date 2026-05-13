// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Memoization helper. Caches results keyed by a custom resolver (default:
 * JSON.stringify of the argument tuple). Uses a Map so eviction is explicit
 * via .clear() / .delete().
 */

type AnyFn = (...args: unknown[]) => unknown;

export interface MemoizedFn<F extends AnyFn> {
  (...args: Parameters<F>): ReturnType<F>;
  clear(): void;
  delete(...args: Parameters<F>): boolean;
  size(): number;
}

export interface MemoizeOptions<F extends AnyFn> {
  /** Build the cache key from arguments. Default: JSON.stringify(args). */
  resolver?: (...args: Parameters<F>) => string;
  /** Maximum cached entries (FIFO eviction). 0 = unbounded. */
  max?: number;
}

export function memoize<F extends AnyFn>(
  fn: F,
  opts: MemoizeOptions<F> = {},
): MemoizedFn<F> {
  const resolver = opts.resolver ?? ((...args: Parameters<F>) => JSON.stringify(args));
  const max = opts.max ?? 0;
  const cache = new Map<string, ReturnType<F>>();

  const wrapped = ((...args: Parameters<F>) => {
    const key = resolver(...args);
    if (cache.has(key)) return cache.get(key) as ReturnType<F>;
    const value = fn(...args) as ReturnType<F>;
    cache.set(key, value);
    if (max > 0 && cache.size > max) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return value;
  }) as MemoizedFn<F>;

  wrapped.clear = (): void => cache.clear();
  wrapped.delete = (...args: Parameters<F>): boolean => cache.delete(resolver(...args));
  wrapped.size = (): number => cache.size;
  return wrapped;
}
