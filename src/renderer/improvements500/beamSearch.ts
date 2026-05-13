// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Beam search for sequence decoding. Maintains the top-k candidate
 * sequences scored by accumulated log probability. Stops when all beams
 * are terminal.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface BeamCandidate<S, T> {
  state: S;
  tokens: T[];
  logProb: number;
  done: boolean;
}

export interface BeamExpansion<S, T> {
  state: S;
  token: T;
  logProb: number;
  done: boolean;
}

export interface BeamSearchOptions<S, T> {
  initial: S;
  expand: (state: S, tokens: readonly T[]) => Iterable<BeamExpansion<S, T>>;
  beamWidth: number;
  maxSteps: number;
}

export function beamSearch<S, T>(opts: BeamSearchOptions<S, T>): BeamCandidate<S, T>[] {
  let beams: BeamCandidate<S, T>[] = [
    { state: opts.initial, tokens: [], logProb: 0, done: false },
  ];
  for (let step = 0; step < opts.maxSteps; step++) {
    const next: BeamCandidate<S, T>[] = [];
    let active = false;
    for (const beam of beams) {
      if (beam.done) {
        next.push(beam);
        continue;
      }
      active = true;
      for (const exp of opts.expand(beam.state, beam.tokens)) {
        next.push({
          state: exp.state,
          tokens: [...beam.tokens, exp.token],
          logProb: beam.logProb + exp.logProb,
          done: exp.done,
        });
      }
    }
    if (!active) break;
    next.sort((a, b) => b.logProb - a.logProb);
    beams = next.slice(0, opts.beamWidth);
  }
  return beams;
}
