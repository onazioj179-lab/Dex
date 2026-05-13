// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Aggregate health score (0..100) blended from crash, memory, performance,
 * and update health signals. Used by the rollback-by-health-score policy.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface HealthSignals {
  crashFreeRatio: number;
  memoryHeadroomRatio: number;
  frameBudgetPassRatio: number;
  ipcSuccessRatio: number;
  updateRollbackPenalty?: number;
}

export interface HealthScoreWeights {
  crash?: number;
  memory?: number;
  frame?: number;
  ipc?: number;
}

export interface HealthScoreResult {
  score: number;
  band: 'critical' | 'degraded' | 'healthy';
  components: { crash: number; memory: number; frame: number; ipc: number };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export function computeHealthScore(
  signals: HealthSignals,
  weights: HealthScoreWeights = {},
): HealthScoreResult {
  const wCrash = weights.crash ?? 0.45;
  const wMem = weights.memory ?? 0.2;
  const wFrame = weights.frame ?? 0.2;
  const wIpc = weights.ipc ?? 0.15;
  const total = wCrash + wMem + wFrame + wIpc;
  const crash = clamp01(signals.crashFreeRatio);
  const memory = clamp01(signals.memoryHeadroomRatio);
  const frame = clamp01(signals.frameBudgetPassRatio);
  const ipc = clamp01(signals.ipcSuccessRatio);
  const blended = (crash * wCrash + memory * wMem + frame * wFrame + ipc * wIpc) / total;
  const penalty = clamp01(signals.updateRollbackPenalty ?? 0);
  const score = Math.round(Math.max(0, blended - penalty * 0.5) * 100);
  const band: HealthScoreResult['band'] =
    score < 60 ? 'critical' : score < 80 ? 'degraded' : 'healthy';
  return { score, band, components: { crash, memory, frame, ipc } };
}
