// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Blends multiple confidence sources (similarity, model probability, prior)
 * into a single 0..1 score and surfaces a textual band for UI display.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface ConfidenceInputs {
  similarity?: number;
  modelProbability?: number;
  prior?: number;
  evidenceCount?: number;
}

export interface ConfidenceWeights {
  similarity?: number;
  modelProbability?: number;
  prior?: number;
}

export type ConfidenceBand = 'low' | 'medium' | 'high';

export interface ConfidenceMeterResult {
  score: number;
  band: ConfidenceBand;
}

function clamp01(v: number | undefined): number {
  if (v === undefined || Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export function confidenceMeter(
  inputs: ConfidenceInputs,
  weights: ConfidenceWeights = {},
): ConfidenceMeterResult {
  const wSim = weights.similarity ?? 0.5;
  const wMod = weights.modelProbability ?? 0.35;
  const wPrior = weights.prior ?? 0.15;
  const total = wSim + wMod + wPrior;
  const blended =
    (clamp01(inputs.similarity) * wSim +
      clamp01(inputs.modelProbability) * wMod +
      clamp01(inputs.prior) * wPrior) /
    total;
  const evidence = Math.max(0, inputs.evidenceCount ?? 0);
  const evidenceBoost = 1 - Math.exp(-evidence / 6);
  const score = clamp01(blended * (0.85 + 0.15 * evidenceBoost));
  const band: ConfidenceBand = score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low';
  return { score, band };
}
