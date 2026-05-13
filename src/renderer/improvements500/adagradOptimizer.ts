// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AdaGrad optimizer step.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface AdagradConfig {
  learningRate?: number;
  epsilon?: number;
}

export interface AdagradState {
  squaredSum: number[];
}

export function createAdagradState(size: number): AdagradState {
  return { squaredSum: new Array<number>(size).fill(0) };
}

export function adagradStep(
  params: number[],
  grads: readonly number[],
  state: AdagradState,
  config: AdagradConfig = {},
): void {
  const lr = config.learningRate ?? 0.01;
  const eps = config.epsilon ?? 1e-8;
  for (let i = 0; i < params.length; i++) {
    const g = grads[i]!;
    state.squaredSum[i] = state.squaredSum[i]! + g * g;
    params[i] = params[i]! - (lr * g) / (Math.sqrt(state.squaredSum[i]!) + eps);
  }
}
