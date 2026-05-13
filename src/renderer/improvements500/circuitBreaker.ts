// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Circuit breaker. Wraps an async operation; opens after a configurable run
 * of consecutive failures, refuses calls until a cooldown elapses, then enters
 * half-open state where a single trial call decides whether to close again.
 *
 * State diagram: closed -> open -> half-open -> closed | open.
 */

export type BreakerState = 'closed' | 'open' | 'halfOpen';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  /** Allows custom error classification - return true to count as failure. */
  isFailure?: (err: unknown) => boolean;
  /** Optional clock injection for tests. */
  now?: () => number;
}

export class CircuitBreakerOpenError extends Error {
  constructor() { super('circuit breaker open'); this.name = 'CircuitBreakerOpenError'; }
}

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly isFailure: (err: unknown) => boolean;
  private readonly now: () => number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = opts.failureThreshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.isFailure = opts.isFailure ?? (() => true);
    this.now = opts.now ?? (() => Date.now());
  }

  get currentState(): BreakerState {
    if (this.state === 'open' && this.now() - this.openedAt >= this.cooldownMs) {
      this.state = 'halfOpen';
    }
    return this.state;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const s = this.currentState;
    if (s === 'open') throw new CircuitBreakerOpenError();
    try {
      const value = await fn();
      this.onSuccess();
      return value;
    } catch (err) {
      if (this.isFailure(err)) this.onFailure();
      throw err;
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = 0;
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    if (this.state === 'halfOpen') {
      this.state = 'open';
      this.openedAt = this.now();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }
}
