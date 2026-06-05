// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { groupByKind, topResult } from '../../src/shared/search/groupResults';
import type { SearchResult, SearchKind } from '../../src/shared/search/SearchOrchestrator';

function res(id: string, kind: SearchKind, score: number): SearchResult {
  return { id, title: id, kind, source: 'test', rawScore: score, score, producedAt: 0 };
}

describe('group results', () => {
  it('groups by kind in canonical order', () => {
    const groups = groupByKind([
      res('f1', 'file', 0.5),
      res('a1', 'app', 0.9),
      res('c1', 'command', 0.7),
      res('f2', 'file', 0.4),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['app', 'command', 'file']);
    expect(groups[0].label).toBe('Apps');
    expect(groups.find((g) => g.kind === 'file')!.results).toHaveLength(2);
  });

  it('appends unknown kinds alphabetically', () => {
    const groups = groupByKind([res('w', 'web', 0.1), res('a', 'app', 0.2)]);
    expect(groups.map((g) => g.kind)).toEqual(['app', 'web']);
  });

  it('topResult returns the highest score', () => {
    expect(topResult([res('a', 'app', 0.2), res('b', 'file', 0.8)])?.id).toBe('b');
    expect(topResult([])).toBeNull();
  });
});
