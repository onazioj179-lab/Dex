// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lazy: a memoized one-shot value producer that defers work until first read
 * and caches the result. AsyncLazy supports promise factories with
 * concurrent-call coalescing.
 */

export interface Lazy<T> {
  get(): T;
  isComputed(): boolean;
  reset(): void;
}

export function lazy<T>(factory: () => T): Lazy<T> {
  let computed = false;
  let value: T;
  return {
    get(): T {
      if (!computed) {
        value = factory();
        computed = true;
      }
      return value;
    },
    isComputed(): boolean {
      return computed;
    },
    reset(): void {
      computed = false;
      value = undefined as unknown as T;
    },
  };
}

export interface AsyncLazy<T> {
  get(): Promise<T>;
  isComputed(): boolean;
  reset(): void;
}

export function lazyAsync<T>(factory: () => Promise<T>): AsyncLazy<T> {
  let pending: Promise<T> | null = null;
  let computed = false;
  let value: T;
  return {
    get(): Promise<T> {
      if (computed) return Promise.resolve(value);
      if (pending) return pending;
      pending = factory().then(
        (v) => {
          value = v;
          computed = true;
          pending = null;
          return v;
        },
        (err) => {
          pending = null;
          throw err;
        },
      );
      return pending;
    },
    isComputed(): boolean {
      return computed;
    },
    reset(): void {
      computed = false;
      pending = null;
      value = undefined as unknown as T;
    },
  };
}
