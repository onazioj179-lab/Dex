// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Gale-Shapley stable marriage algorithm. Produces a stable matching
 * between two equal-sized sets given each member's preference list.
 */

export interface StableMarriageResult {
  /** Matching from proposers index -> receivers index. */
  matchProposers: Int32Array;
  /** Inverse: receiver index -> proposer index. */
  matchReceivers: Int32Array;
}

/**
 * `proposerPrefs[p]` is the ordered preference list of receivers (most preferred first).
 * `receiverPrefs[r]` is the ordered preference list of proposers (most preferred first).
 * Both arrays must be permutations of 0..n-1 with n proposers and n receivers.
 */
export function stableMarriage(
  proposerPrefs: ReadonlyArray<readonly number[]>,
  receiverPrefs: ReadonlyArray<readonly number[]>,
): StableMarriageResult {
  const n = proposerPrefs.length;
  if (receiverPrefs.length !== n) throw new Error('proposer/receiver counts must match');
  // Receiver-side rank table: rank[r][p] = position of p in r's prefs (lower is better)
  const rank: Int32Array[] = [];
  for (let r = 0; r < n; r += 1) {
    const arr = new Int32Array(n);
    for (let i = 0; i < n; i += 1) arr[receiverPrefs[r]![i]!] = i;
    rank.push(arr);
  }
  const next = new Int32Array(n); // next[p] = index into p's pref list to try
  const matchProposers = new Int32Array(n).fill(-1);
  const matchReceivers = new Int32Array(n).fill(-1);
  const free: number[] = [];
  for (let p = 0; p < n; p += 1) free.push(p);
  while (free.length > 0) {
    const p = free.shift()!;
    const r = proposerPrefs[p]![next[p]!]!;
    next[p] = next[p]! + 1;
    const current = matchReceivers[r]!;
    if (current === -1) {
      matchReceivers[r] = p;
      matchProposers[p] = r;
    } else if (rank[r]![p]! < rank[r]![current]!) {
      matchReceivers[r] = p;
      matchProposers[p] = r;
      matchProposers[current] = -1;
      free.push(current);
    } else {
      free.push(p);
    }
  }
  return { matchProposers, matchReceivers };
}
