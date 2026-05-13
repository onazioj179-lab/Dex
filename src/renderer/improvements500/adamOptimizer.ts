// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Adam optimizer step (per-parameter). Maintains first and second moment
 * estimates internally per AdamState.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface AdamConfig {
  learningRate?: number;
  beta1?: number;
  beta2?: number;
  epsilon?: number;
}

export interface AdamState {
  m: number[];
  v: number[];
  t: number;
}

export function createAdamState(size: number): AdamState {
  return { m: new Array<number>(size).fill(0), v: new Array<number>(size).fill(0), t: 0 };
}

export function adamStep(
  params: number[],
  grads: readonly number[],
  state: AdamState,
  config: AdamConfig = {},
): void {
  const lr = config.learningRate ?? 0.001;
  const b1 = config.beta1 ?? 0.9;
  const b2 = config.beta2 ?? 0.999;
  const eps = config.epsilon ?? 1e-8;
  state.t += 1;
  const bc1 = 1 - b1 ** state.t;
  const bc2 = 1 - b2 ** state.t;
  for (let i = 0; i < params.length; i++) {
    const g = grads[i]!;
    state.m[i] = b1 * state.m[i]! + (1 - b1) * g;
    state.v[i] = b2 * state.v[i]! + (1 - b2) * g * g;
    const mHat = state.m[i]! / bc1;
    const vHat = state.v[i]! / bc2;
    params[i] = params[i]! - (lr * mHat) / (Math.sqrt(vHat) + eps);
  }
}
