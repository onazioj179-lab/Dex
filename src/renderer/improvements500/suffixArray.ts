// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Suffix array via simple O(n log^2 n) doubling sort. Adequate for
 * strings up to a few hundred KB; for production use see SA-IS.
 */

export function suffixArray(text: string): Int32Array {
  const n = text.length;
  const sa = new Int32Array(n);
  const rank = new Int32Array(n);
  const tmp = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    sa[i] = i;
    rank[i] = text.charCodeAt(i);
  }
  for (let k = 1; ; k *= 2) {
    const cmp = (a: number, b: number): number => {
      if (rank[a] !== rank[b]) return rank[a]! - rank[b]!;
      const ra = a + k < n ? rank[a + k]! : -1;
      const rb = b + k < n ? rank[b + k]! : -1;
      return ra - rb;
    };
    const view = Array.from(sa);
    view.sort(cmp);
    for (let i = 0; i < n; i += 1) sa[i] = view[i]!;
    tmp[sa[0]!] = 0;
    for (let i = 1; i < n; i += 1) {
      tmp[sa[i]!] = tmp[sa[i - 1]!]! + (cmp(sa[i - 1]!, sa[i]!) < 0 ? 1 : 0);
    }
    for (let i = 0; i < n; i += 1) rank[i] = tmp[i]!;
    if (rank[sa[n - 1]!] === n - 1) break;
    if (k >= n) break;
  }
  return sa;
}

/** LCP (longest common prefix) array via Kasai's algorithm. */
export function lcpArray(text: string, sa: Int32Array): Int32Array {
  const n = text.length;
  const rank = new Int32Array(n);
  for (let i = 0; i < n; i += 1) rank[sa[i]!] = i;
  const lcp = new Int32Array(Math.max(0, n - 1));
  let h = 0;
  for (let i = 0; i < n; i += 1) {
    if (rank[i]! > 0) {
      const j = sa[rank[i]! - 1]!;
      while (i + h < n && j + h < n && text.charCodeAt(i + h) === text.charCodeAt(j + h)) h += 1;
      lcp[rank[i]! - 1] = h;
      if (h > 0) h -= 1;
    } else {
      h = 0;
    }
  }
  return lcp;
}
