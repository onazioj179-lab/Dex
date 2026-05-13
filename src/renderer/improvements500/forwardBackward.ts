// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Forward-backward algorithm for hidden Markov models. Computes alpha
 * (forward), beta (backward), and posterior gamma matrices. Uses scaling
 * to avoid underflow.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface HmmFbModel {
  initial: ReadonlyArray<number>;
  transition: ReadonlyArray<ReadonlyArray<number>>;
  emission: ReadonlyArray<ReadonlyArray<number>>;
}

export interface ForwardBackwardResult {
  alpha: number[][];
  beta: number[][];
  gamma: number[][];
  logLikelihood: number;
}

export function forwardBackward(
  model: HmmFbModel,
  observations: readonly number[],
): ForwardBackwardResult {
  const S = model.initial.length;
  const T = observations.length;
  const alpha: number[][] = Array.from({ length: T }, () => new Array<number>(S).fill(0));
  const beta: number[][] = Array.from({ length: T }, () => new Array<number>(S).fill(0));
  const scale = new Array<number>(T).fill(0);

  if (T === 0) return { alpha, beta, gamma: [], logLikelihood: 0 };

  for (let i = 0; i < S; i++) {
    alpha[0]![i] = model.initial[i]! * model.emission[i]![observations[0]!]!;
    scale[0] += alpha[0]![i]!;
  }
  if (scale[0] === 0) scale[0] = 1;
  for (let i = 0; i < S; i++) alpha[0]![i] = alpha[0]![i]! / scale[0]!;

  for (let t = 1; t < T; t++) {
    let s = 0;
    for (let j = 0; j < S; j++) {
      let sum = 0;
      for (let i = 0; i < S; i++) sum += alpha[t - 1]![i]! * model.transition[i]![j]!;
      alpha[t]![j] = sum * model.emission[j]![observations[t]!]!;
      s += alpha[t]![j]!;
    }
    if (s === 0) s = 1;
    scale[t] = s;
    for (let j = 0; j < S; j++) alpha[t]![j] = alpha[t]![j]! / s;
  }

  for (let i = 0; i < S; i++) beta[T - 1]![i] = 1 / scale[T - 1]!;
  for (let t = T - 2; t >= 0; t--) {
    for (let i = 0; i < S; i++) {
      let sum = 0;
      for (let j = 0; j < S; j++) {
        sum += model.transition[i]![j]! * model.emission[j]![observations[t + 1]!]! * beta[t + 1]![j]!;
      }
      beta[t]![i] = sum / scale[t]!;
    }
  }

  const gamma: number[][] = Array.from({ length: T }, () => new Array<number>(S).fill(0));
  for (let t = 0; t < T; t++) {
    let norm = 0;
    for (let i = 0; i < S; i++) {
      gamma[t]![i] = alpha[t]![i]! * beta[t]![i]!;
      norm += gamma[t]![i]!;
    }
    if (norm > 0) for (let i = 0; i < S; i++) gamma[t]![i] = gamma[t]![i]! / norm;
  }

  let logL = 0;
  for (const s of scale) logL += Math.log(s);
  return { alpha, beta, gamma, logLikelihood: logL };
}
