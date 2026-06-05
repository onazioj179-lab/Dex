// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { shortestPath, isConnected, hopDistance } from '../../src/shared/nexus/pathfind';

function chain(): NexusModel {
  const m = new NexusModel();
  ['a', 'b', 'c', 'd'].forEach((id) => m.upsertEntity({ id, kind: 'file', label: id, ts: 1 }));
  m.link('a', 'b');
  m.link('b', 'c');
  m.link('c', 'd');
  return m;
}

describe('nexus pathfind', () => {
  it('finds the shortest path along a chain', () => {
    expect(shortestPath(chain(), 'a', 'd')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('prefers fewer hops when a shortcut exists', () => {
    const m = chain();
    m.link('a', 'd'); // shortcut
    expect(shortestPath(m, 'a', 'd')).toEqual(['a', 'd']);
  });

  it('returns [from] when from === to', () => {
    expect(shortestPath(chain(), 'b', 'b')).toEqual(['b']);
  });

  it('returns null when unreachable or unknown', () => {
    const m = new NexusModel();
    ['a', 'b'].forEach((id) => m.upsertEntity({ id, kind: 'file', label: id, ts: 1 }));
    expect(shortestPath(m, 'a', 'b')).toBeNull(); // no edges
    expect(shortestPath(m, 'a', 'zzz')).toBeNull(); // unknown target
  });

  it('isConnected and hopDistance', () => {
    const m = chain();
    expect(isConnected(m, 'a', 'd')).toBe(true);
    expect(hopDistance(m, 'a', 'd')).toBe(3);
    expect(hopDistance(m, 'd', 'a')).toBe(-1); // directed
  });
});
