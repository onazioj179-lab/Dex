// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tiny TTL cache + tool-call budget for UKI agents.
 */

// DEX v3.8.9 - web cache + tool budget

interface CacheEntry<V> { value: V; expiresAt: number; }

export class TtlCache<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  constructor(private readonly defaultTtlMs: number, private readonly maxEntries: number = 1000) {}

  get(key: K, now: number = Date.now()): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) { this.map.delete(key); return undefined; }
    return entry.value;
  }

  set(key: K, value: V, ttlMs: number = this.defaultTtlMs, now: number = Date.now()): void {
    if (this.map.size >= this.maxEntries) {
      // Evict the oldest insertion (Map preserves insertion order).
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, { value, expiresAt: now + ttlMs });
  }

  delete(key: K): boolean { return this.map.delete(key); }
  size(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  evictExpired(now: number = Date.now()): number {
    let n = 0;
    for (const [k, v] of this.map) {
      if (v.expiresAt <= now) { this.map.delete(k); n += 1; }
    }
    return n;
  }
}

export interface ToolBudget {
  perToolLimit: Record<string, number>;
  used: Record<string, number>;
}

export function createToolBudget(perToolLimit: Record<string, number>): ToolBudget {
  return { perToolLimit, used: {} };
}

export function chargeTool(budget: ToolBudget, toolId: string, n: number = 1): { budget: ToolBudget; ok: boolean; remaining: number } {
  const limit = budget.perToolLimit[toolId];
  const usedNow = (budget.used[toolId] ?? 0) + n;
  const ok = limit === undefined ? true : usedNow <= limit;
  const next: ToolBudget = { ...budget, used: { ...budget.used, [toolId]: usedNow } };
  const remaining = limit === undefined ? Infinity : Math.max(0, limit - usedNow);
  return { budget: next, ok, remaining };
}

export function resetToolBudget(budget: ToolBudget): ToolBudget {
  return { ...budget, used: {} };
}
