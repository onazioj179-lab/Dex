// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 8 - Cross-app intelligence + productivity automation primitives.
 *
 * ContextBus: typed publish/subscribe envelope router with TTL.
 * MacroComposer: define multi-step macros with undo and dry-run.
 */

export interface ContextEnvelope<T = unknown> {
  readonly topic: string;
  readonly payload: T;
  readonly originApp: string;
  readonly publishedAt: number;
  readonly ttlMs?: number;
  readonly correlationId?: string;
}

export type ContextSubscriber<T = unknown> = (env: ContextEnvelope<T>) => void;

export class ContextBus {
  private readonly subscribers = new Map<string, Set<ContextSubscriber>>();
  private readonly recent: ContextEnvelope[] = [];
  private readonly maxRecent: number;

  constructor(opts: { maxRecent?: number } = {}) {
    this.maxRecent = Math.max(0, opts.maxRecent ?? 100);
  }

  subscribe<T = unknown>(topic: string, fn: ContextSubscriber<T>): () => void {
    const set = this.subscribers.get(topic) ?? new Set();
    set.add(fn as ContextSubscriber);
    this.subscribers.set(topic, set);
    return () => set.delete(fn as ContextSubscriber);
  }

  publish<T>(env: ContextEnvelope<T>): number {
    if (!env.topic) throw new Error('topic required');
    if (!env.originApp) throw new Error('originApp required');
    if (this.maxRecent > 0) {
      this.recent.push(env);
      while (this.recent.length > this.maxRecent) this.recent.shift();
    }
    let delivered = 0;
    const subs = this.subscribers.get(env.topic);
    if (!subs) return 0;
    for (const sub of subs) {
      try { (sub as ContextSubscriber<T>)(env); delivered++; } catch { /* isolation */ }
    }
    return delivered;
  }

  /** Replay envelopes still alive (publishedAt + ttl > now) for a topic. */
  replay(topic: string, now: number): ContextEnvelope[] {
    return this.recent.filter((e) => {
      if (e.topic !== topic) return false;
      if (e.ttlMs == null) return true;
      return now - e.publishedAt <= e.ttlMs;
    });
  }

  topicCount(): number { return this.subscribers.size; }
  recentCount(): number { return this.recent.length; }
}

export interface MacroStep<TCtx> {
  readonly id: string;
  run(ctx: TCtx): void | Promise<void>;
  undo?(ctx: TCtx): void | Promise<void>;
}

export interface MacroDefinition<TCtx> {
  readonly id: string;
  readonly steps: readonly MacroStep<TCtx>[];
}

export interface MacroRunResult {
  readonly macroId: string;
  readonly ranSteps: string[];
  readonly failedStep?: string;
  readonly error?: Error;
  readonly undone: boolean;
}

export class MacroComposer<TCtx> {
  private readonly macros = new Map<string, MacroDefinition<TCtx>>();

  define(macro: MacroDefinition<TCtx>): void {
    if (this.macros.has(macro.id)) throw new Error(`macro ${macro.id} exists`);
    if (macro.steps.length === 0) throw new Error('macro must have at least one step');
    const seen = new Set<string>();
    for (const s of macro.steps) {
      if (seen.has(s.id)) throw new Error(`duplicate step id ${s.id}`);
      seen.add(s.id);
    }
    this.macros.set(macro.id, macro);
  }

  has(id: string): boolean { return this.macros.has(id); }
  size(): number { return this.macros.size; }

  async run(macroId: string, ctx: TCtx): Promise<MacroRunResult> {
    const macro = this.macros.get(macroId);
    if (!macro) throw new Error(`unknown macro ${macroId}`);
    const ranSteps: string[] = [];
    for (const step of macro.steps) {
      try {
        await step.run(ctx);
        ranSteps.push(step.id);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        let undone = true;
        for (const sid of ranSteps.slice().reverse()) {
          const s = macro.steps.find((x) => x.id === sid)!;
          if (!s.undo) { undone = false; continue; }
          try { await s.undo(ctx); } catch { undone = false; }
        }
        return { macroId, ranSteps, failedStep: step.id, error, undone };
      }
    }
    return { macroId, ranSteps, undone: false };
  }

  /** Returns the step ids that would run, without executing anything. */
  dryRun(macroId: string): string[] {
    const macro = this.macros.get(macroId);
    if (!macro) throw new Error(`unknown macro ${macroId}`);
    return macro.steps.map((s) => s.id);
  }
}
