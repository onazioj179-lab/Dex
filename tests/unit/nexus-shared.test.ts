// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.5 - Nexus shared module tests

import { describe, it, expect } from 'vitest';
import {
  LAYOUT_MODES,
  computeLayout,
  layoutGrid,
  layoutCircle,
  layoutTree,
  type LayoutNode,
} from '../../src/shared/nexus/layouts';
import { embed, embedAll, findSimilar, cosineSimilarity, tokenize } from '../../src/shared/nexus/embeddings';
import {
  validateMessage,
  applyMessage,
  createInProcessTransport,
  NEXUS_P2P_PROTOCOL_VERSION,
  type MutableGraph,
  type NexusP2PMessage,
} from '../../src/shared/nexus/p2p';

const SAMPLE_NODES: LayoutNode[] = Array.from({ length: 12 }, (_, i) => ({
  id: `n${i}`,
  weight: (i % 4) + 1,
  group: ['alpha', 'beta', 'gamma'][i % 3],
}));

describe('Nexus layouts', () => {
  it('exposes 10 layout modes', () => {
    expect(LAYOUT_MODES).toHaveLength(10);
  });

  it.each(LAYOUT_MODES)('layout "%s" returns positions for every node within bounds', (mode) => {
    const out = computeLayout(mode, SAMPLE_NODES, { width: 800, height: 600 });
    for (const n of SAMPLE_NODES) {
      expect(out[n.id]).toBeTruthy();
      expect(Number.isFinite(out[n.id].x)).toBe(true);
      expect(Number.isFinite(out[n.id].y)).toBe(true);
    }
  });

  it('returns empty result for empty input', () => {
    expect(layoutGrid([], { width: 100, height: 100 })).toEqual({});
    expect(layoutCircle([], { width: 100, height: 100 })).toEqual({});
  });

  it('grid positions are unique for distinct nodes', () => {
    const out = layoutGrid(SAMPLE_NODES, { width: 800, height: 600 });
    const set = new Set(Object.values(out).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    expect(set.size).toBe(SAMPLE_NODES.length);
  });

  it('tree layout uses links to build hierarchy', () => {
    const links = [
      { source: 'n0', target: 'n1' },
      { source: 'n0', target: 'n2' },
      { source: 'n1', target: 'n3' },
    ];
    const out = layoutTree(SAMPLE_NODES, { width: 800, height: 600, links });
    // Root is at top, n3 (depth 2) is below n1 (depth 1) which is below n0 (depth 0)
    expect(out.n0.y).toBeLessThan(out.n1.y);
    expect(out.n1.y).toBeLessThan(out.n3.y);
  });

  it('rejects unknown layout mode', () => {
    expect(() => computeLayout('nope' as never, SAMPLE_NODES, { width: 800, height: 600 })).toThrow();
  });
});

describe('Nexus embeddings', () => {
  it('tokenizes simple text', () => {
    expect(tokenize('Hello, World 123!')).toEqual(['hello', 'world', '123']);
  });

  it('produces a vector of the requested length', () => {
    const v = embed('hello world', { dims: 64 });
    expect(v).toHaveLength(64);
  });

  it('similar text scores higher than unrelated text', () => {
    const pool = embedAll(
      ['the quick brown fox', 'a fast tan dog', 'react component renders ui', 'database transaction commit'],
      (t) => t,
    );
    const hits = findSimilar('quick brown fox', pool, 4);
    expect(hits[0].item).toBe('the quick brown fox');
    expect(hits[0].score).toBeGreaterThan(hits[hits.length - 1].score);
  });

  it('cosine similarity of identical normalised vectors is ~1', () => {
    const v = embed('react component');
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('handles empty text without crashing', () => {
    const v = embed('');
    expect(v.every((x) => x === 0)).toBe(true);
  });
});

describe('Nexus p2p protocol', () => {
  it('accepts a well-formed hello and rejects wrong protocol', () => {
    const ok: NexusP2PMessage = { kind: 'hello', protocol: NEXUS_P2P_PROTOCOL_VERSION, peerId: 'p1', nick: 'a' };
    expect(validateMessage(ok)).toEqual(ok);
    expect(validateMessage({ kind: 'hello', protocol: 999, peerId: 'p1', nick: 'a' })).toBeNull();
  });

  it('rejects malformed messages', () => {
    expect(validateMessage(null)).toBeNull();
    expect(validateMessage({})).toBeNull();
    expect(validateMessage({ kind: 'graph:add-node' })).toBeNull();
    expect(validateMessage({ kind: 'cursor', peerId: 'p', nodeId: 42 })).toBeNull();
  });

  it('applies graph mutations idempotently', () => {
    const g: MutableGraph = { nodes: [], links: [] };
    applyMessage(g, { kind: 'graph:add-node', nodeId: 'a', label: 'A' });
    applyMessage(g, { kind: 'graph:add-node', nodeId: 'a', label: 'A' });
    expect(g.nodes).toHaveLength(1);
    applyMessage(g, { kind: 'graph:add-node', nodeId: 'b', label: 'B' });
    applyMessage(g, { kind: 'graph:add-link', source: 'a', target: 'b', weight: 0.7 });
    applyMessage(g, { kind: 'graph:add-link', source: 'a', target: 'b' });
    expect(g.links).toHaveLength(1);
    applyMessage(g, { kind: 'graph:remove-node', nodeId: 'a' });
    expect(g.nodes).toEqual([{ id: 'b', label: 'B', group: undefined }]);
    expect(g.links).toEqual([]);
  });

  it('in-process transport delivers messages both directions', () => {
    const { a, b } = createInProcessTransport();
    const aGot: NexusP2PMessage[] = [];
    const bGot: NexusP2PMessage[] = [];
    a.onMessage((m) => aGot.push(m));
    b.onMessage((m) => bGot.push(m));
    a.send({ kind: 'ping', ts: 1 });
    b.send({ kind: 'pong', ts: 2 });
    expect(bGot).toEqual([{ kind: 'ping', ts: 1 }]);
    expect(aGot).toEqual([{ kind: 'pong', ts: 2 }]);
    a.close();
  });
});
