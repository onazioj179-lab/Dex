// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Nexus degree centrality (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { degreeCentrality } from '../../src/shared/graph/centrality';

describe('degreeCentrality', () => {
  it('returns all-zero scores when there are no edges', () => {
    expect(degreeCentrality(3, [])).toEqual([0, 0, 0]);
  });

  it('scores a star graph with the hub at 1 and leaves proportionally', () => {
    // Node 0 connects to 1, 2, 3 -> hub degree 3, leaves degree 1.
    const c = degreeCentrality(4, [[0, 1], [0, 2], [0, 3]]);
    expect(c[0]).toBe(1);            // hub
    expect(c[1]).toBeCloseTo(1 / 3); // leaves: degree 1 of max 3
    expect(c[2]).toBeCloseTo(1 / 3);
    expect(c[3]).toBeCloseTo(1 / 3);
  });

  it('gives equal scores around a ring', () => {
    const c = degreeCentrality(3, [[0, 1], [1, 2], [2, 0]]);
    expect(c).toEqual([1, 1, 1]); // every node has degree 2
  });

  it('ignores out-of-range edge indices', () => {
    const c = degreeCentrality(2, [[0, 1], [0, 5], [-1, 1]]);
    // Valid contributions: 0->+1 (edge0) +1 (edge1 a=0) ; 1->+1 (edge0) +1 (edge2 b=1)
    // degree[0]=2, degree[1]=2 -> both normalize to 1.
    expect(c).toEqual([1, 1]);
  });

  it('handles a zero-node graph', () => {
    expect(degreeCentrality(0, [])).toEqual([]);
  });
});
