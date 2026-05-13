// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  Trie,
  lazy,
  lazyAsync,
  AsyncMutex,
  PubSub,
  joinPath,
  dirname,
  basename,
  extname,
  normalizePath,
  relativePath,
  CodedError,
  isCodedError,
  hasCode,
  wrapError,
  RetryBudget,
  IdleQueue,
  heapSort,
  partialHeapSort,
  encodeBase32,
  decodeBase32,
} from '../../src/renderer/improvements500';

describe('Trie', () => {
  it('insert + has + get + delete', () => {
    const t = new Trie<number>();
    t.insert('cat', 1);
    t.insert('car', 2);
    t.insert('cart', 3);
    expect(t.has('cat')).toBe(true);
    expect(t.get('car')).toBe(2);
    expect(t.size).toBe(3);
    expect(t.delete('car')).toBe(true);
    expect(t.has('car')).toBe(false);
    expect(t.size).toBe(2);
  });
  it('prefixSearch returns lex-sorted matches', () => {
    const t = new Trie();
    ['apple', 'application', 'apply', 'banana'].forEach((w) => t.insert(w));
    expect(t.prefixSearch('app')).toEqual(['apple', 'application', 'apply']);
    expect(t.prefixSearch('apx')).toEqual([]);
  });
  it('prefixSearch respects limit', () => {
    const t = new Trie();
    ['a', 'ab', 'abc', 'abcd'].forEach((w) => t.insert(w));
    expect(t.prefixSearch('a', 2)).toEqual(['a', 'ab']);
  });
});

describe('lazy', () => {
  it('computes once', () => {
    let calls = 0;
    const v = lazy(() => { calls += 1; return 42; });
    expect(v.isComputed()).toBe(false);
    expect(v.get()).toBe(42);
    expect(v.get()).toBe(42);
    expect(calls).toBe(1);
    v.reset();
    expect(v.isComputed()).toBe(false);
    expect(v.get()).toBe(42);
    expect(calls).toBe(2);
  });
  it('lazyAsync coalesces concurrent calls', async () => {
    let calls = 0;
    const v = lazyAsync(async () => { calls += 1; return 'x'; });
    const [a, b, c] = await Promise.all([v.get(), v.get(), v.get()]);
    expect(a).toBe('x'); expect(b).toBe('x'); expect(c).toBe('x');
    expect(calls).toBe(1);
  });
  it('lazyAsync rethrows and resets pending', async () => {
    let calls = 0;
    const v = lazyAsync<string>(async () => {
      calls += 1;
      if (calls === 1) throw new Error('first');
      return 'ok';
    });
    await expect(v.get()).rejects.toThrow('first');
    expect(await v.get()).toBe('ok');
  });
});

describe('AsyncMutex', () => {
  it('serializes critical sections', async () => {
    const m = new AsyncMutex();
    const order: number[] = [];
    const tasks = [1, 2, 3].map((n) => m.runExclusive(async () => {
      order.push(n);
      await new Promise((r) => setTimeout(r, 5));
      order.push(n * 10);
    }));
    await Promise.all(tasks);
    expect(order).toEqual([1, 10, 2, 20, 3, 30]);
  });
  it('release exits exclusivity', async () => {
    const m = new AsyncMutex();
    const r = await m.acquire();
    expect(m.locked).toBe(true);
    r();
    expect(m.locked).toBe(false);
  });
});

describe('PubSub', () => {
  it('matches exact and wildcard topics', () => {
    const ps = new PubSub();
    const seen: Array<[string, unknown]> = [];
    ps.subscribe('orders.*', (t, p) => seen.push([t, p]));
    ps.subscribe('orders.created', (t, p) => seen.push([`exact:${t}`, p]));
    ps.publish('orders.created', { id: 1 });
    ps.publish('orders.shipped', { id: 2 });
    ps.publish('users.created', { id: 3 });
    expect(seen.length).toBe(3);
    expect(seen.find((s) => s[0] === 'exact:orders.created')).toBeTruthy();
  });
  it('** matches any depth', () => {
    const ps = new PubSub();
    let n = 0;
    ps.subscribe('a.**', () => { n += 1; });
    ps.publish('a.b'); ps.publish('a.b.c'); ps.publish('z.x');
    expect(n).toBe(2);
  });
  it('unsubscribe stops further delivery', () => {
    const ps = new PubSub();
    let count = 0;
    const off = ps.subscribe('x', () => { count += 1; });
    ps.publish('x'); off(); ps.publish('x');
    expect(count).toBe(1);
  });
});

describe('pathParse', () => {
  it('joinPath, dirname, basename, extname', () => {
    expect(joinPath('a', 'b', 'c.txt')).toBe('a/b/c.txt');
    expect(joinPath('/a//', '/b')).toBe('/a/b');
    expect(dirname('/a/b/c.txt')).toBe('/a/b');
    expect(dirname('/foo')).toBe('/');
    expect(basename('/a/b/c.txt')).toBe('c.txt');
    expect(basename('/a/b/c.txt', '.txt')).toBe('c');
    expect(extname('foo.tar.gz')).toBe('.gz');
    expect(extname('.hidden')).toBe('');
  });
  it('normalizePath collapses ./.. and slashes', () => {
    expect(normalizePath('/a/./b/../c/')).toBe('/a/c');
    expect(normalizePath('a/b/../../../c')).toBe('../c');
    expect(normalizePath('')).toBe('');
  });
  it('relativePath', () => {
    expect(relativePath('/a/b/c', '/a/b/d/e')).toBe('../d/e');
    expect(relativePath('/a/b', '/a/b')).toBe('.');
  });
});

describe('errorCode', () => {
  it('CodedError carries code, details, cause', () => {
    const cause = new Error('orig');
    const e = new CodedError('E_NET', 'Network down', { cause, details: { url: 'x' } });
    expect(e.code).toBe('E_NET');
    expect(isCodedError(e)).toBe(true);
    expect(hasCode(e, 'E_NET')).toBe(true);
    expect(hasCode(e, 'E_OTHER')).toBe(false);
    expect(e.cause).toBe(cause);
    expect(e.toJSON().code).toBe('E_NET');
  });
  it('wrapError factory', () => {
    const e = wrapError('E_DB', 'fail', new Error('orig'));
    expect(e.code).toBe('E_DB');
  });
});

describe('RetryBudget', () => {
  it('caps to maxRetries inside window', () => {
    let now = 0;
    const b = new RetryBudget({ maxRetries: 3, windowMs: 1000, now: () => now });
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(false);
    expect(b.available()).toBe(0);
    now = 1500; // window expired
    expect(b.available()).toBe(3);
    expect(b.tryConsume()).toBe(true);
  });
});

describe('IdleQueue', () => {
  it('processes pushed tasks', async () => {
    const q = new IdleQueue({ timeoutMs: 50 });
    const seen: number[] = [];
    q.push(() => seen.push(1));
    q.push(() => seen.push(2));
    q.push(() => seen.push(3));
    await new Promise((r) => setTimeout(r, 80));
    expect(seen).toEqual([1, 2, 3]);
    expect(q.size).toBe(0);
  });
  it('clear empties pending', () => {
    const q = new IdleQueue();
    q.push(() => { /* noop */ });
    q.push(() => { /* noop */ });
    q.clear();
    expect(q.size).toBe(0);
  });
});

describe('heapSort', () => {
  it('sorts ascending in place', () => {
    const arr = [5, 1, 4, 2, 8, 3];
    heapSort(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 8]);
  });
  it('comparator support', () => {
    const arr = [{ p: 3 }, { p: 1 }, { p: 2 }];
    heapSort(arr, (a, b) => a.p - b.p);
    expect(arr.map((x) => x.p)).toEqual([1, 2, 3]);
  });
  it('partialHeapSort returns top-k smallest', () => {
    expect(partialHeapSort([5, 1, 4, 2, 8, 3], 3)).toEqual([1, 2, 3]);
    expect(partialHeapSort([1, 2, 3], 0)).toEqual([]);
  });
});

describe('base32', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" - 40 bits, no padding
    const enc = encodeBase32(bytes);
    expect(enc).toBe('JBSWY3DP');
    const back = decodeBase32(enc);
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });
  it('pads when bits do not align', () => {
    const bytes = new Uint8Array([72, 105]); // "Hi" - 16 bits -> "JBUQ===="
    const enc = encodeBase32(bytes);
    expect(enc.endsWith('=')).toBe(true);
    expect(Array.from(decodeBase32(enc))).toEqual([72, 105]);
  });
  it('handles empty input', () => {
    expect(encodeBase32(new Uint8Array(0))).toBe('');
    expect(decodeBase32('').length).toBe(0);
  });
  it('rejects invalid chars', () => {
    expect(() => decodeBase32('!!')).toThrow();
  });
});
