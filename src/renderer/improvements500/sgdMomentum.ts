// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SGD with classical momentum.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface MomentumConfig {
  learningRate?: number;
  momentum?: number;
  nesterov?: boolean;
}

export interface MomentumState {
  velocity: number[];
}

export function createMomentumState(size: number): MomentumState {
  return { velocity: new Array<number>(size).fill(0) };
}

export function sgdMomentumStep(
  params: number[],
  grads: readonly number[],
  state: MomentumState,
  config: MomentumConfig = {},
): void {
  const lr = config.learningRate ?? 0.01;
  const mu = config.momentum ?? 0.9;
  const nesterov = config.nesterov ?? false;
  for (let i = 0; i < params.length; i++) {
    const g = grads[i]!;
    state.velocity[i] = mu * state.velocity[i]! - lr * g;
    if (nesterov) {
      params[i] = params[i]! + mu * state.velocity[i]! - lr * g;
    } else {
      params[i] = params[i]! + state.velocity[i]!;
    }
  }
}
