// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * RenderBudget -- per-frame render time budget governor for DEX renderer.
 *
 * DEX targets 60 fps (16.67 ms/frame). Heavy components (Nexus graph,
 * Prism canvas, Imosion waveform) must not blow this budget silently.
 *
 * Usage:
 *   const budget = new RenderBudget('NexusGraph');
 *   budget.begin();
 *   // ... render ...
 *   const ms = budget.end();  // records into histogram; warns if over budget
 *
 * W3 #158: per-frame render budget
 */

import { rendererMetrics } from '../../shared/metrics';

const TARGET_FPS = 60;
export const FRAME_BUDGET_MS = 1000 / TARGET_FPS; // ~16.67 ms

export class RenderBudget {
  private _t0 = 0;
  private readonly _hist: ReturnType<typeof rendererMetrics.histogram>;
  private _overBudgetCount = 0;
  private readonly _overBudgetCounter: ReturnType<typeof rendererMetrics.counter>;

  constructor(public readonly name: string) {
    this._hist = rendererMetrics.histogram(`renderer.render.${name}`, 256, 'ms');
    this._overBudgetCounter = rendererMetrics.counter(`renderer.overbudget.${name}`, 'frames');
  }

  begin(): void {
    this._t0 = performance.now();
  }

  end(): number {
    const elapsed = performance.now() - this._t0;
    this._hist.record(elapsed);
    if (elapsed > FRAME_BUDGET_MS) {
      this._overBudgetCount++;
      this._overBudgetCounter.inc();
      if (this._overBudgetCount === 1 || this._overBudgetCount % 60 === 0) {
        // eslint-disable-next-line no-console
        console.warn(`[RenderBudget:${this.name}] over budget: ${elapsed.toFixed(1)} ms (target ${FRAME_BUDGET_MS.toFixed(1)} ms)`);
      }
    }
    return elapsed;
  }

  get stats() {
    return this._hist.snapshot();
  }

  reset(): void {
    this._hist.reset();
    this._overBudgetCount = 0;
  }
}

/** Convenience: wrap a synchronous render function with budget measurement. */
export function withRenderBudget<T>(name: string, fn: () => T): T {
  const b = new RenderBudget(name);
  b.begin();
  const r = fn();
  b.end();
  return r;
}
