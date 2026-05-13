// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Simulated annealing for combinatorial optimization. Minimizes the energy
 * function. Returns the best state seen.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface SimulatedAnnealingOptions<T> {
  initial: T;
  energy: (state: T) => number;
  neighbor: (state: T, rand: () => number) => T;
  iterations?: number;
  initialTemperature?: number;
  finalTemperature?: number;
  rand?: () => number;
}

export interface SimulatedAnnealingResult<T> {
  bestState: T;
  bestEnergy: number;
}

export function simulatedAnnealing<T>(opts: SimulatedAnnealingOptions<T>): SimulatedAnnealingResult<T> {
  const rand = opts.rand ?? Math.random;
  const iterations = opts.iterations ?? 1000;
  const t0 = opts.initialTemperature ?? 1;
  const tEnd = opts.finalTemperature ?? 1e-6;
  if (!(t0 > 0) || !(tEnd > 0) || tEnd > t0) {
    throw new RangeError('simulatedAnnealing: temperatures must satisfy 0 < tEnd <= t0');
  }
  const cooling = Math.pow(tEnd / t0, 1 / Math.max(1, iterations - 1));

  let current = opts.initial;
  let currentE = opts.energy(current);
  let best = current;
  let bestE = currentE;
  let temperature = t0;

  for (let i = 0; i < iterations; i++) {
    const candidate = opts.neighbor(current, rand);
    const candidateE = opts.energy(candidate);
    const delta = candidateE - currentE;
    if (delta <= 0 || rand() < Math.exp(-delta / temperature)) {
      current = candidate;
      currentE = candidateE;
      if (currentE < bestE) {
        best = current;
        bestE = currentE;
      }
    }
    temperature *= cooling;
  }
  return { bestState: best, bestEnergy: bestE };
}
