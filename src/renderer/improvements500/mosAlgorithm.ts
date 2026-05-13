// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Mo's algorithm for offline range queries. Sorts queries by sqrt
 * blocks and maintains a sliding window in O((N + Q) * sqrt(N) * F)
 * where F is the cost of add/remove. This implementation provides a
 * generic hook-based runner that calls user-supplied add/remove and
 * collects an answer at each query.
 */

export interface MoQuery {
  lo: number;
  hi: number; // exclusive
}

/**
 * Run Mo's algorithm. `add(idx)` adds element at index idx into the
 * current window; `remove(idx)` removes it; `getAnswer()` returns the
 * current window's answer. Returns answers in original query order.
 */
export function mosAlgorithm<A>(
  n: number,
  queries: ReadonlyArray<MoQuery>,
  add: (idx: number) => void,
  remove: (idx: number) => void,
  getAnswer: () => A,
): A[] {
  const block = Math.max(1, Math.floor(Math.sqrt(Math.max(1, n))));
  const order = queries.map((_, i) => i);
  order.sort((a, b) => {
    const ba = Math.floor(queries[a]!.lo / block);
    const bb = Math.floor(queries[b]!.lo / block);
    if (ba !== bb) return ba - bb;
    // Snake ordering on hi
    return ba % 2 === 0 ? queries[a]!.hi - queries[b]!.hi : queries[b]!.hi - queries[a]!.hi;
  });
  const answers: A[] = new Array(queries.length);
  let curLo = 0;
  let curHi = 0; // current window is [curLo, curHi)
  for (const idx of order) {
    const q = queries[idx]!;
    while (curHi < q.hi) {
      add(curHi);
      curHi += 1;
    }
    while (curLo > q.lo) {
      curLo -= 1;
      add(curLo);
    }
    while (curHi > q.hi) {
      curHi -= 1;
      remove(curHi);
    }
    while (curLo < q.lo) {
      remove(curLo);
      curLo += 1;
    }
    answers[idx] = getAnswer();
  }
  return answers;
}
