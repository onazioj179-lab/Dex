// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { SearchIndex } from '../../src/shared/search/searchIndex';

describe('SearchIndex', () => {
  it('indexes and BM25-ranks matching docs', () => {
    const idx = new SearchIndex();
    idx.add('1', 'quick brown fox');
    idx.add('2', 'lazy dog sleeps');
    idx.add('3', 'quick fox quick run');
    const hits = idx.search('quick fox');
    const ids = hits.map((h) => h.id);
    expect(ids).toContain('1');
    expect(ids).toContain('3');
    expect(ids).not.toContain('2');
    expect(idx.size()).toBe(3);
  });

  it('supports replace and remove', () => {
    const idx = new SearchIndex();
    idx.add('1', 'alpha');
    idx.add('1', 'beta'); // replace
    expect(idx.size()).toBe(1);
    expect(idx.search('alpha')).toEqual([]); // old content gone
    expect(idx.search('beta').map((h) => h.id)).toEqual(['1']);
    idx.remove('1');
    expect(idx.size()).toBe(0);
  });

  it('empty query or empty index → []', () => {
    const idx = new SearchIndex();
    expect(idx.search('x')).toEqual([]);
    idx.add('1', 'hello world');
    expect(idx.search('')).toEqual([]);
    idx.clear();
    expect(idx.size()).toBe(0);
  });
});
