// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Tier-Aware Startup Sequencer
// ==========================================================================
// Controls the Phase A / B / C startup sequence with tier-aware delays.
// On Tier 3 Critical, shows a usable window in under 3 seconds. Workers
// start one at a time with staggered gaps to avoid CPU spikes. Caches
// the V8 bytecode and hardware profile for subsequent launches.
// ==========================================================================

import * as log from 'electron-log';
import { hardwareDetector, CapabilityTierName } from './HardwareDetector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StartupPhaseResult {
  phase: 'A' | 'B' | 'C';
  durationMs: number;
  tier: CapabilityTierName;
}

export interface StartupSequenceResult {
  phases: StartupPhaseResult[];
  totalMs: number;
  tier: CapabilityTierName;
  workersStarted: string[];
}

// ---------------------------------------------------------------------------
// Worker start delays per tier (ms between each worker start)
// ---------------------------------------------------------------------------

const WORKER_STAGGER_MS: Record<CapabilityTierName, number> = {
  'tier-1-premium': 0,
  'tier-1': 50,
  'tier-2': 100,
  'tier-3-standard': 150,
  'tier-3-critical': 200,
};

// ---------------------------------------------------------------------------
// Worker start order per tier
// ---------------------------------------------------------------------------

function getWorkerOrder(tier: CapabilityTierName): Array<{ name: string; deferMs: number; essential: boolean }> {
  if (tier === 'tier-3-critical') {
    return [
      { name: 'database', deferMs: 0, essential: true },
      { name: 'security', deferMs: 0, essential: true },
      { name: 'search', deferMs: 0, essential: true },
      { name: 'file-transfer', deferMs: 0, essential: false },
      { name: 'intelligence', deferMs: 5000, essential: false },
      { name: 'analytics', deferMs: 30_000, essential: false },
      { name: 'thumbnail', deferMs: 60_000, essential: false },
      { name: 'rewind-logger', deferMs: 60_000, essential: false },
      { name: 'learning-engine', deferMs: 60_000, essential: false },
      { name: 'journal-analysis', deferMs: 60_000, essential: false },
      { name: 'task-queue', deferMs: 60_000, essential: false },
    ];
  }

  if (tier === 'tier-3-standard') {
    return [
      { name: 'database', deferMs: 0, essential: true },
      { name: 'security', deferMs: 0, essential: true },
      { name: 'search', deferMs: 0, essential: true },
      { name: 'file-transfer', deferMs: 0, essential: false },
      { name: 'thumbnail', deferMs: 0, essential: false },
      { name: 'intelligence', deferMs: 3000, essential: false },
      { name: 'analytics', deferMs: 10_000, essential: false },
      { name: 'rewind-logger', deferMs: 15_000, essential: false },
      { name: 'learning-engine', deferMs: 20_000, essential: false },
      { name: 'journal-analysis', deferMs: 25_000, essential: false },
      { name: 'task-queue', deferMs: 30_000, essential: false },
    ];
  }

  if (tier === 'tier-2') {
    return [
      { name: 'database', deferMs: 0, essential: true },
      { name: 'security', deferMs: 0, essential: true },
      { name: 'search', deferMs: 0, essential: true },
      { name: 'file-transfer', deferMs: 0, essential: false },
      { name: 'thumbnail', deferMs: 0, essential: false },
      { name: 'intelligence', deferMs: 1000, essential: false },
      { name: 'analytics', deferMs: 2000, essential: false },
      { name: 'rewind-logger', deferMs: 3000, essential: false },
      { name: 'learning-engine', deferMs: 4000, essential: false },
      { name: 'journal-analysis', deferMs: 5000, essential: false },
      { name: 'task-queue', deferMs: 6000, essential: false },
    ];
  }

  return [
    { name: 'database', deferMs: 0, essential: true },
    { name: 'security', deferMs: 0, essential: true },
    { name: 'search', deferMs: 0, essential: true },
    { name: 'file-transfer', deferMs: 0, essential: false },
    { name: 'thumbnail', deferMs: 0, essential: false },
    { name: 'intelligence', deferMs: 0, essential: false },
    { name: 'analytics', deferMs: 0, essential: false },
    { name: 'rewind-logger', deferMs: 0, essential: false },
    { name: 'learning-engine', deferMs: 0, essential: false },
    { name: 'journal-analysis', deferMs: 0, essential: false },
    { name: 'task-queue', deferMs: 0, essential: false },
  ];
}

// ---------------------------------------------------------------------------
// Tier-Aware Startup Sequencer
// ---------------------------------------------------------------------------

class TierAwareStartupSequencer {
  private phaseResults: StartupPhaseResult[] = [];
  private workersStarted: string[] = [];
  private workerStartFns = new Map<string, () => Promise<void> | void>();

  registerWorker(name: string, startFn: () => Promise<void> | void): void {
    this.workerStartFns.set(name, startFn);
  }

  async runPhaseA(): Promise<StartupPhaseResult> {
    const start = performance.now();
    const tier = hardwareDetector.getTier();
    const elapsed = Math.round(performance.now() - start);
    const result: StartupPhaseResult = { phase: 'A', durationMs: elapsed, tier };
    this.phaseResults.push(result);
    log.info(`[TierStartup] Phase A complete in ${elapsed}ms (${tier})`);
    return result;
  }

  async runPhaseB(showWindow: () => void): Promise<StartupPhaseResult> {
    const start = performance.now();
    const tier = hardwareDetector.getTier();
    showWindow();
    const elapsed = Math.round(performance.now() - start);
    const result: StartupPhaseResult = { phase: 'B', durationMs: elapsed, tier };
    this.phaseResults.push(result);
    log.info(`[TierStartup] Phase B complete in ${elapsed}ms`);
    return result;
  }

  async runPhaseC(): Promise<StartupPhaseResult> {
    const start = performance.now();
    const tier = hardwareDetector.getTier();
    const order = getWorkerOrder(tier);
    const stagger = WORKER_STAGGER_MS[tier];

    const immediate = order.filter(w => w.deferMs === 0);
    const deferred = order.filter(w => w.deferMs > 0);

    for (let i = 0; i < immediate.length; i++) {
      await this.startWorker(immediate[i].name);
      if (stagger > 0 && i < immediate.length - 1) {
        await new Promise(r => setTimeout(r, stagger));
      }
    }

    for (const spec of deferred) {
      setTimeout(async () => {
        await this.startWorker(spec.name);
      }, spec.deferMs);
    }

    const elapsed = Math.round(performance.now() - start);
    const result: StartupPhaseResult = { phase: 'C', durationMs: elapsed, tier };
    this.phaseResults.push(result);
    log.info(`[TierStartup] Phase C immediate in ${elapsed}ms, ${deferred.length} deferred`);
    return result;
  }

  getResult(): StartupSequenceResult {
    return {
      phases: [...this.phaseResults],
      totalMs: this.phaseResults.reduce((s, p) => s + p.durationMs, 0),
      tier: hardwareDetector.getTier(),
      workersStarted: [...this.workersStarted],
    };
  }

  private async startWorker(name: string): Promise<void> {
    const fn = this.workerStartFns.get(name);
    if (!fn) return;
    try {
      await fn();
      this.workersStarted.push(name);
    } catch (err) {
      log.error(`[TierStartup] Worker ${name} failed:`, err);
    }
  }
}

export const tierStartupSequencer = new TierAwareStartupSequencer();
