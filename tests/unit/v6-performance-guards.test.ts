// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX v6 PERFORMANCE BUDGET REGRESSION GUARDS (Phase 1.2 / Phase 2)
 * ===========================================================================
 * Hard timing budgets for the v6-touched hot paths so a future change that
 * makes them expensive fails CI. These guard real shipped pure functions
 * (FloatingLauncher drag clamp, Nexus graph centrality, Prism lens correction,
 * Calendar conflict scan) plus a synthetic Spotlight-scale search filter --
 * the prescribed budget guard for the measure-gated index. Budgets are
 * deliberately generous (regression catchers, not micro-benchmarks).
 */

import { describe, it, expect } from 'vitest';
import { clampToBounds } from '../../src/renderer/components/floatingLauncherGeometry';
import { degreeCentrality } from '../../src/shared/graph/centrality';
import { applyLensCorrection } from '../../src/shared/creative/lensCorrect';
import { findEventConflicts, TimedEvent } from '../../src/shared/calendar/eventConflicts';

function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function medianOf(runs: number, fn: () => number): number {
  const ds: number[] = [];
  for (let i = 0; i < runs; i++) ds.push(fn());
  ds.sort((a, b) => a - b);
  return ds[Math.floor(ds.length / 2)];
}

/** Log the measured median, then assert it stays under budget. Gives the owner
 *  a real number for each renderer-side scale path, not just pass/fail. */
function reportUnder(label: string, dur: number, budget: number): void {
  // eslint-disable-next-line no-console
  console.info(`[v6-perf] ${label}: ${dur.toFixed(2)}ms median (budget ${budget}ms)`);
  expect(dur).toBeLessThan(budget);
}

const BUDGETS = {
  /** FloatingLauncher: 100k drag clamps (a drag fires one per rAF frame). */
  LAUNCHER_CLAMP_100K: 30,
  /** Spotlight-scale: filter + score a synthetic 100k-item corpus. */
  SPOTLIGHT_FILTER_100K: 80,
  /** Nexus: degree centrality over a 10k-node / ~30k-edge knowledge graph. */
  NEXUS_CENTRALITY_10K: 25,
  /** Prism: lens correction (distortion+CA+vignette) over a 160x160 image. */
  PRISM_LENS_160: 60,
  /** Calendar: conflict scan over 5k events across 365 days. */
  CALENDAR_CONFLICTS_5K: 25,
};

describe('v6 perf guard — FloatingLauncher drag clamp', () => {
  it('clamps 100k times within budget', () => {
    const dur = medianOf(5, () => measure(() => {
      let acc = 0;
      for (let i = 0; i < 100_000; i++) {
        const p = clampToBounds((i % 2000) - 200, (i % 1400) - 150, 1600, 1200);
        acc += p.x + p.y;
      }
      expect(acc).toBeGreaterThan(0);
    }));
    reportUnder('FloatingLauncher clamp x100k', dur, BUDGETS.LAUNCHER_CLAMP_100K);
  });
});

describe('v6 perf guard — Spotlight-scale search filter', () => {
  // Synthetic corpus mirroring the engine's scan+score shape (the real scorer
  // is class-private). This is the plan's "budget guard" for the index.
  const corpus = Array.from({ length: 100_000 }, (_, i) => ({
    id: `item-${i}`,
    searchText: `result item ${i} ${i % 7 === 0 ? 'project alpha' : 'misc'}`,
    frequency: i % 50,
  }));

  it('filters + scores 100k items within budget', () => {
    const dur = medianOf(5, () => measure(() => {
      const q = 'project';
      const scored = corpus
        .filter(it => it.searchText.includes(q))
        .map(it => ({ it, score: it.searchText.indexOf(q) * -1 + it.frequency }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      expect(scored.length).toBe(20);
    }));
    reportUnder('Spotlight filter+score x100k', dur, BUDGETS.SPOTLIGHT_FILTER_100K);
  });
});

describe('v6 perf guard — Nexus degree centrality', () => {
  it('computes centrality for 10k nodes / ~30k edges within budget', () => {
    const n = 10_000;
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      edges.push([i, (i + 1) % n]);
      edges.push([i, (i + 7) % n]);
      edges.push([i, (i + 53) % n]);
    }
    const dur = medianOf(5, () => measure(() => {
      const c = degreeCentrality(n, edges);
      expect(c.length).toBe(n);
    }));
    reportUnder('Nexus degree centrality 10k/30k', dur, BUDGETS.NEXUS_CENTRALITY_10K);
  });
});

describe('v6 perf guard — Prism lens correction', () => {
  it('corrects a 160x160 image within budget', () => {
    const w = 160, h = 160;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 31) % 256;
    const dur = medianOf(5, () => measure(() => {
      const out = applyLensCorrection(data, w, h, { distortion: 0.1, chromatic: 0.3, vignette: -0.4 });
      expect(out.length).toBe(data.length);
    }));
    reportUnder('Prism lens correction 160x160', dur, BUDGETS.PRISM_LENS_160);
  });
});

describe('v6 perf guard — Calendar conflict scan', () => {
  it('scans 5k events across a year within budget', () => {
    const events: TimedEvent[] = Array.from({ length: 5_000 }, (_, i) => {
      const day = i % 365;
      const start = (i % 20) * 30; // staggered start minutes
      return {
        id: `e-${i}`,
        date: `2026-${String(1 + Math.floor(day / 31)).padStart(2, '0')}-${String(1 + (day % 28)).padStart(2, '0')}`,
        start,
        end: start + 45,
      };
    });
    const dur = medianOf(5, () => measure(() => {
      const conflicts = findEventConflicts(events);
      expect(conflicts).toBeInstanceOf(Set);
    }));
    reportUnder('Calendar conflict scan 5k', dur, BUDGETS.CALENDAR_CONFLICTS_5K);
  });
});
