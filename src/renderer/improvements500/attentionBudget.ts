// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Attention budget tracks user interruption capacity over a rolling window.
 * The shell uses it to decide whether to show a notification or hold it
 * for the next quiet moment.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface AttentionBudgetOptions {
  windowMs?: number;
  maxInterruptions?: number;
}

export interface AttentionEvent {
  weight: number;
  at: number;
}

export class AttentionBudget {
  private events: AttentionEvent[] = [];
  private windowMs: number;
  private max: number;

  constructor(options: AttentionBudgetOptions = {}) {
    this.windowMs = Math.max(1000, options.windowMs ?? 5 * 60_000);
    this.max = Math.max(1, options.maxInterruptions ?? 5);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.events.length > 0 && this.events[0]!.at < cutoff) this.events.shift();
  }

  used(now = Date.now()): number {
    this.prune(now);
    let sum = 0;
    for (const e of this.events) sum += e.weight;
    return sum;
  }

  remaining(now = Date.now()): number {
    return Math.max(0, this.max - this.used(now));
  }

  canInterrupt(weight = 1, now = Date.now()): boolean {
    return this.used(now) + weight <= this.max;
  }

  record(weight = 1, now = Date.now()): boolean {
    if (!this.canInterrupt(weight, now)) return false;
    this.events.push({ weight, at: now });
    return true;
  }

  reset(): void { this.events = []; }
}
