// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  ok, err, isOk, isErr, map, mapErr, unwrap, unwrapOrThrow,
  tryCatch, tryCatchAsync, assertNever, panic, nonNull,
  safeJSON, toDexError, type Result,
} from '../../src/shared/result';

describe('Result<T,E>', () => {
  it('ok and err helpers produce correct shape', () => {
    const a = ok(42);
    const b = err({ code: 'X', message: 'bad' });
    expect(a.ok).toBe(true);
    expect(isOk(a)).toBe(true);
    expect(isErr(b)).toBe(true);
    expect(a.value).toBe(42);
  });

  it('map transforms only on success', () => {
    expect(map(ok(2), (x: number) => x * 3)).toEqual({ ok: true, value: 6 });
    const e: Result<number> = err(toDexError('boom'));
    expect(map(e, (x: number) => x * 3)).toBe(e);
  });

  it('mapErr transforms only on failure', () => {
    expect(mapErr(ok(1), (e) => ({ ...e, code: 'Z' }))).toEqual({ ok: true, value: 1 });
    const r = mapErr(err(toDexError('a')), (e) => ({ ...e, message: 'b' }));
    expect(isErr(r) && r.error.message).toBe('b');
  });

  it('unwrap returns fallback on failure', () => {
    expect(unwrap(ok('hi'), 'fallback')).toBe('hi');
    expect(unwrap(err(toDexError('boom')), 'fallback')).toBe('fallback');
  });

  it('unwrapOrThrow throws on failure with op context', () => {
    expect(unwrapOrThrow(ok(7))).toBe(7);
    expect(() => unwrapOrThrow(err(toDexError('boom')), 'theOp')).toThrowError(/theOp/);
  });

  it('tryCatch wraps thrown sync errors', () => {
    const r = tryCatch(() => { throw new Error('nope'); }, 'sync.op');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.message).toBe('nope');
      expect(r.error.op).toBe('sync.op');
    }
  });

  it('tryCatchAsync wraps rejected promises', async () => {
    const r = await tryCatchAsync(async () => { throw new Error('async-nope'); }, 'a.op');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.message).toBe('async-nope');
  });

  it('assertNever throws with op context', () => {
    expect(() => assertNever('x' as never, 'switch.op')).toThrowError(/switch\.op/);
  });

  it('panic throws with structured cause', () => {
    expect(() => panic('halt', 'op.x')).toThrowError(/halt/);
  });

  it('nonNull narrows or panics', () => {
    expect(nonNull('x')).toBe('x');
    expect(() => nonNull(null, 'must.have')).toThrowError(/must\.have/);
  });
});

describe('safeJSON', () => {
  it('parse rejects non-strings without throwing', () => {
    const r = safeJSON.parse(42 as unknown as string);
    expect(isErr(r)).toBe(true);
  });

  it('parse rejects malformed JSON', () => {
    const r = safeJSON.parse('{ not json');
    expect(isErr(r)).toBe(true);
  });

  it('parse honors guard', () => {
    type N = { n: number };
    const isN = (v: unknown): v is N => !!v && typeof v === 'object' && typeof (v as N).n === 'number';
    expect(isOk(safeJSON.parse('{"n":1}', isN))).toBe(true);
    expect(isErr(safeJSON.parse('{"n":"x"}', isN))).toBe(true);
  });

  it('stringify handles circular refs and bigints', () => {
    const a: any = { x: 1 }; a.self = a;
    const r = safeJSON.stringify(a);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toContain('"[circular]"');

    const b = safeJSON.stringify({ big: 9007199254740993n });
    expect(isOk(b)).toBe(true);
    if (isOk(b)) expect(b.value).toContain('9007199254740993');
  });
});
