// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * RMSProp optimizer step.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface RmspropConfig {
  learningRate?: number;
  decay?: number;
  epsilon?: number;
}

export interface RmspropState {
  cache: number[];
}

export function createRmspropState(size: number): RmspropState {
  return { cache: new Array<number>(size).fill(0) };
}

export function rmspropStep(
  params: number[],
  grads: readonly number[],
  state: RmspropState,
  config: RmspropConfig = {},
): void {
  const lr = config.learningRate ?? 0.001;
  const decay = config.decay ?? 0.9;
  const eps = config.epsilon ?? 1e-8;
  for (let i = 0; i < params.length; i++) {
    const g = grads[i]!;
    state.cache[i] = decay * state.cache[i]! + (1 - decay) * g * g;
    params[i] = params[i]! - (lr * g) / (Math.sqrt(state.cache[i]!) + eps);
  }
}
