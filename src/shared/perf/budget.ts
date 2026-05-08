// =============================================================================
// DEX Platform — Wave 7.5 perf budget enforcement
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Performance budget — every heavy operation declares its cost; the budget
 * tracks live load and refuses or downgrades concurrent requests.
 *
 * Integrates with PerfTier presets (mid: 4 workers, high: 8, etc.) to size
 * the per-tier ceiling automatically.
 */

import { getPerfTier, presetFor, type PerfTier } from '../../main/compute/PerfTier';

export interface OpCost {
  /** Estimated CPU thread count consumed (0..N). */
  cpuThreads: number;
  /** Estimated peak RAM in MB. */
  ramMb: number;
  /** Estimated GPU% load 0..100. */
  gpuPct?: number;
}

export interface BudgetSnapshot {
  tier: PerfTier;
  cpuUsedThreads: number;
  cpuMaxThreads: number;
  ramUsedMb: number;
  ramMaxMb: number;
  gpuUsedPct: number;
  gpuMaxPct: number;
  /** 'green' | 'yellow' | 'red' — for status bar indicator. */
  status: 'green' | 'yellow' | 'red';
}

interface Reservation {
  id: number;
  cost: OpCost;
}

export class PerfBudget {
  private active = new Map<number, Reservation>();
  private nextId = 1;
  private cpuMax: number;
  private ramMax: number;
  private gpuMax: number;

  constructor(tier: PerfTier = getPerfTier()) {
    const preset = presetFor(tier);
    this.cpuMax = preset.workerThreads;
    // Coarse RAM budget per tier.
    this.ramMax = tier === 'workstation' ? 16_000
      : tier === 'high' ? 8_000
      : tier === 'mid' ? 4_000
      : tier === 'low' ? 2_000
      : 1_000;
    this.gpuMax = preset.webgpuEnabled ? 100 : 0;
  }

  /** Try to reserve. Returns reservation id or `null` if budget exceeded. */
  tryReserve(cost: OpCost): number | null {
    const snap = this.snapshot();
    if (snap.cpuUsedThreads + cost.cpuThreads > this.cpuMax) return null;
    if (snap.ramUsedMb + cost.ramMb > this.ramMax) return null;
    if (cost.gpuPct && snap.gpuUsedPct + cost.gpuPct > this.gpuMax) return null;
    const id = this.nextId++;
    this.active.set(id, { id, cost });
    return id;
  }

  /** Reserve, downgrading cost (halving CPU/GPU) if necessary. */
  reserveOrDowngrade(cost: OpCost): { id: number; cost: OpCost } | null {
    let r = this.tryReserve(cost);
    if (r !== null) return { id: r, cost };
    // Downgrade once: halve cpu + gpu
    const half: OpCost = {
      cpuThreads: Math.max(1, Math.floor(cost.cpuThreads / 2)),
      ramMb: cost.ramMb,
      gpuPct: cost.gpuPct ? cost.gpuPct / 2 : undefined,
    };
    r = this.tryReserve(half);
    return r === null ? null : { id: r, cost: half };
  }

  release(id: number): void {
    this.active.delete(id);
  }

  snapshot(): BudgetSnapshot {
    let cpu = 0, ram = 0, gpu = 0;
    for (const r of this.active.values()) {
      cpu += r.cost.cpuThreads;
      ram += r.cost.ramMb;
      gpu += r.cost.gpuPct ?? 0;
    }
    const status: BudgetSnapshot['status'] =
      (cpu >= this.cpuMax || ram >= this.ramMax * 0.95 || gpu >= this.gpuMax) ? 'red'
      : (cpu >= this.cpuMax * 0.7 || ram >= this.ramMax * 0.7 || gpu >= this.gpuMax * 0.7) ? 'yellow'
      : 'green';
    return {
      tier: getPerfTier(),
      cpuUsedThreads: cpu, cpuMaxThreads: this.cpuMax,
      ramUsedMb: ram, ramMaxMb: this.ramMax,
      gpuUsedPct: gpu, gpuMaxPct: this.gpuMax,
      status,
    };
  }
}

export const globalBudget = new PerfBudget();
