// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Categorical cross-entropy between a target distribution and predicted
 * probabilities. The target may be a one-hot vector or a soft target.
 * Predicted probabilities are clamped to [eps, 1] for stability.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function crossEntropy(
  predicted: readonly number[],
  target: readonly number[],
  eps = 1e-12,
): number {
  if (predicted.length !== target.length) throw new Error('crossEntropy: length mismatch');
  let loss = 0;
  for (let i = 0; i < predicted.length; i++) {
    const p = Math.min(1, Math.max(eps, predicted[i]!));
    loss -= target[i]! * Math.log(p);
  }
  return loss;
}
