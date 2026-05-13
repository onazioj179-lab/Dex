// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  damerauDistance,
  wildcardMatch,
  arc4Stream,
  arc4Encrypt,
  fnv1a32,
  fnv1a32Hex,
  ReservoirSampler,
  reservoirSample,
  TopKHeap,
  bitapSearch,
  zigZagEncode,
  zigZagDecode,
  base58Encode,
  base58Decode,
  pcg32,
} from '../../src/renderer/improvements500';

describe('damerauDistance', () => {
  it('zero for equal', () => {
    expect(damerauDistance('hello', 'hello')).toBe(0);
  });
  it('one for transposition', () => {
    expect(damerauDistance('ab', 'ba')).toBe(1);
  });
  it('matches Levenshtein-ish for substitutions', () => {
    expect(damerauDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('wildcardMatch', () => {
  it('* within segment', () => {
    expect(wildcardMatch('src/*.ts', 'src/foo.ts')).toBe(true);
    expect(wildcardMatch('src/*.ts', 'src/sub/foo.ts')).toBe(false);
  });
  it('** across segments', () => {
    expect(wildcardMatch('src/**/*.ts', 'src/a/b/c.ts')).toBe(true);
  });
  it('? single char', () => {
    expect(wildcardMatch('a?c', 'abc')).toBe(true);
    expect(wildcardMatch('a?c', 'ac')).toBe(false);
  });
});

describe('arc4', () => {
  it('encrypt then decrypt restores plaintext', () => {
    const key = new Uint8Array([1, 2, 3, 4]);
    const data = new Uint8Array([10, 20, 30, 40, 50]);
    const enc = arc4Encrypt(key, data);
    const dec = arc4Encrypt(key, enc);
    expect(Array.from(dec)).toEqual(Array.from(data));
  });
  it('stream length honored', () => {
    expect(arc4Stream(new Uint8Array([1]), 7).length).toBe(7);
  });
});

describe('fnv1a32', () => {
  it('deterministic for same input', () => {
    expect(fnv1a32('foo')).toBe(fnv1a32('foo'));
  });
  it('different for different input', () => {
    expect(fnv1a32('foo')).not.toBe(fnv1a32('bar'));
  });
  it('hex 8 chars', () => {
    expect(fnv1a32Hex('abc').length).toBe(8);
  });
});

describe('reservoirSample', () => {
  it('returns at most k items', () => {
    const out = reservoirSample([1, 2, 3, 4, 5], 3);
    expect(out.length).toBe(3);
  });
  it('returns all when stream <= k', () => {
    const out = reservoirSample([1, 2], 5);
    expect(out.sort()).toEqual([1, 2]);
  });
  it('rejects bad k', () => {
    expect(() => new ReservoirSampler(0)).toThrow();
  });
});

describe('TopKHeap', () => {
  it('keeps largest by score', () => {
    const h = new TopKHeap<number>(3, (n) => n);
    for (const v of [5, 1, 8, 3, 9, 2, 7]) h.push(v);
    expect(h.values()).toEqual([9, 8, 7]);
  });
});

describe('bitapSearch', () => {
  it('exact match', () => {
    expect(bitapSearch('hello world', 'world')).toBe(6);
    expect(bitapSearch('abcdef', 'xyz')).toBe(-1);
  });
  it('approximate with one error', () => {
    expect(bitapSearch('abcdefg', 'aXcd', 1)).toBe(0);
  });
});

describe('zigZag', () => {
  it('roundtrip', () => {
    for (const n of [0, -1, 1, -2, 2, 100, -100, 0x7fffffff, -0x80000000]) {
      expect(zigZagDecode(zigZagEncode(n))).toBe(n);
    }
  });
  it('small magnitudes -> small codes', () => {
    expect(zigZagEncode(0)).toBe(0);
    expect(zigZagEncode(-1)).toBe(1);
    expect(zigZagEncode(1)).toBe(2);
    expect(zigZagEncode(-2)).toBe(3);
  });
});

describe('base58', () => {
  it('roundtrip arbitrary bytes', () => {
    const data = new Uint8Array([0, 0, 1, 2, 3, 4, 5, 255, 128]);
    const encoded = base58Encode(data);
    expect(/^[1-9A-HJ-NP-Za-km-z]+$/.test(encoded)).toBe(true);
    const decoded = base58Decode(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(data));
  });
  it('preserves leading zero bytes as leading 1s', () => {
    const enc = base58Encode(new Uint8Array([0, 0, 0, 5]));
    expect(enc.startsWith('111')).toBe(true);
  });
  it('rejects invalid chars', () => {
    expect(() => base58Decode('OIl0')).toThrow();
  });
});

describe('pcg32', () => {
  it('deterministic for same seed', () => {
    const a = pcg32(42); const b = pcg32(42);
    for (let i = 0; i < 10; i += 1) expect(a.next32()).toBe(b.next32());
  });
  it('different seeds diverge', () => {
    const a = pcg32(1); const b = pcg32(2);
    expect(a.next32()).not.toBe(b.next32());
  });
  it('nextFloat is in [0,1)', () => {
    const r = pcg32(7);
    for (let i = 0; i < 50; i += 1) {
      const f = r.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});
