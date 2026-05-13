// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Viterbi algorithm for the most-likely state sequence in a hidden Markov
 * model with discrete observations. Uses log probabilities for stability.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface HmmModel {
  /** Initial state probabilities, length S. */
  initial: ReadonlyArray<number>;
  /** Transition matrix S x S; transition[i][j] = P(j | i). */
  transition: ReadonlyArray<ReadonlyArray<number>>;
  /** Emission matrix S x O; emission[i][o] = P(observation o | state i). */
  emission: ReadonlyArray<ReadonlyArray<number>>;
}

export interface ViterbiResult {
  states: number[];
  logProbability: number;
}

const NEG_INF = Number.NEGATIVE_INFINITY;

function logSafe(p: number): number {
  return p > 0 ? Math.log(p) : NEG_INF;
}

export function viterbi(model: HmmModel, observations: readonly number[]): ViterbiResult {
  const S = model.initial.length;
  const T = observations.length;
  if (T === 0) return { states: [], logProbability: 0 };
  const dp = Array.from({ length: T }, () => new Float64Array(S).fill(NEG_INF));
  const bp = Array.from({ length: T }, () => new Int32Array(S));
  for (let i = 0; i < S; i++) {
    dp[0]![i] = logSafe(model.initial[i]!) + logSafe(model.emission[i]![observations[0]!]!);
  }
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < S; j++) {
      let bestScore = NEG_INF;
      let bestPrev = 0;
      const emit = logSafe(model.emission[j]![observations[t]!]!);
      for (let i = 0; i < S; i++) {
        const score = dp[t - 1]![i]! + logSafe(model.transition[i]![j]!) + emit;
        if (score > bestScore) {
          bestScore = score;
          bestPrev = i;
        }
      }
      dp[t]![j] = bestScore;
      bp[t]![j] = bestPrev;
    }
  }
  let bestEnd = 0;
  let bestEndScore = dp[T - 1]![0]!;
  for (let i = 1; i < S; i++) {
    if (dp[T - 1]![i]! > bestEndScore) {
      bestEndScore = dp[T - 1]![i]!;
      bestEnd = i;
    }
  }
  const states = new Array<number>(T);
  states[T - 1] = bestEnd;
  for (let t = T - 1; t > 0; t--) states[t - 1] = bp[t]![states[t]!]!;
  return { states, logProbability: bestEndScore };
}
