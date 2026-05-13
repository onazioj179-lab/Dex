// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Concurrency limiter (a la `p-limit`). Enforces a max number of in-flight
 * tasks while still allowing FIFO submission. Returned promise resolves /
 * rejects with the underlying task's outcome.
 */

type Task<T> = () => Promise<T>;

export interface ConcurrencyLimiter {
  <T>(task: Task<T>): Promise<T>;
  active: number;
  pending: number;
}

export function createLimiter(maxConcurrent: number): ConcurrencyLimiter {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error('maxConcurrent must be a positive integer');
  }
  let active = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    if (active >= maxConcurrent) return;
    const start = queue.shift();
    if (start) {
      active += 1;
      start();
    }
  };

  const limiter = (<T>(task: Task<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const start = (): void => {
        Promise.resolve()
          .then(task)
          .then((v) => { resolve(v); })
          .catch((e: unknown) => { reject(e); })
          .finally(() => {
            active -= 1;
            next();
          });
      };
      queue.push(start);
      next();
    });
  }) as ConcurrencyLimiter;

  Object.defineProperty(limiter, 'active', { get: () => active });
  Object.defineProperty(limiter, 'pending', { get: () => queue.length });
  return limiter;
}
