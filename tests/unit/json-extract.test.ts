// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { extractJson, hasJson } from '../../src/shared/uki/jsonExtract';

describe('json extract', () => {
  it('extracts an object embedded in prose', () => {
    expect(extractJson('here is {"a":1,"b":[2,3]} done')).toEqual({ a: 1, b: [2, 3] });
  });

  it('extracts from a code fence', () => {
    expect(extractJson('```json\n{"x":true}\n```')).toEqual({ x: true });
  });

  it('is string- and escape-aware', () => {
    expect(extractJson('{"s":"has } brace"}')).toEqual({ s: 'has } brace' });
    expect(extractJson('{"s":"quote \\" and } brace"}')).toEqual({ s: 'quote " and } brace' });
  });

  it('extracts arrays', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns null when there is no valid JSON', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{ broken')).toBeNull();
    expect(hasJson('nothing')).toBe(false);
    expect(hasJson('{"ok":1}')).toBe(true);
  });
});
