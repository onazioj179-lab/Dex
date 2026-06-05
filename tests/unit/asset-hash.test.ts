// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { hashString, hashBytes, findDuplicate, dedupe } from '../../src/renderer/services/assetHash';

describe('asset hashing & dedup', () => {
  it('is deterministic and differs for different content', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).not.toBe(hashString('world'));
    expect(hashString('hello')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('hashes bytes consistently with equivalent content', () => {
    const a = hashBytes([104, 105]); // "hi"
    const b = hashBytes(new Uint8Array([104, 105]));
    expect(a).toBe(b);
  });

  it('finds an existing duplicate by hash', () => {
    const existing = [{ id: '1', hash: 'aaaa' }, { id: '2', hash: 'bbbb' }];
    expect(findDuplicate(existing, 'bbbb')).toBe('2');
    expect(findDuplicate(existing, 'cccc')).toBeNull();
  });

  it('dedupes keeping first occurrence and mapping duplicates', () => {
    const { unique, duplicates } = dedupe([
      { id: 'a', hash: 'h1' },
      { id: 'b', hash: 'h2' },
      { id: 'c', hash: 'h1' }, // dup of a
      { id: 'd', hash: 'h2' }, // dup of b
    ]);
    expect(unique.map((u) => u.id)).toEqual(['a', 'b']);
    expect(duplicates).toEqual({ c: 'a', d: 'b' });
  });
});
