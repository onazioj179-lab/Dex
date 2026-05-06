// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import {
  envelopeOk, envelopeErr, unwrapEnvelope, safeHandler, callIpc,
  isStructuredCloneSafe,
} from '../../src/shared/safeIpc';
import { isOk, isErr, toDexError } from '../../src/shared/result';

describe('IPC envelope', () => {
  it('envelopeOk wraps success with timestamp + op', () => {
    const e = envelopeOk('test.op', { n: 1 });
    expect(e.ok).toBe(true);
    expect(e.value).toEqual({ n: 1 });
    expect(e.op).toBe('test.op');
    expect(typeof e.t).toBe('number');
  });

  it('envelopeErr carries structured DexError', () => {
    const e = envelopeErr('test.op', toDexError('bad'));
    expect(e.ok).toBe(false);
    expect(e.error?.message).toBe('bad');
  });

  it('unwrapEnvelope rejects malformed shapes', () => {
    expect(isErr(unwrapEnvelope(null))).toBe(true);
    expect(isErr(unwrapEnvelope('not an object'))).toBe(true);
    expect(isErr(unwrapEnvelope({}))).toBe(true);
  });

  it('unwrapEnvelope round-trips ok and err', () => {
    expect(isOk(unwrapEnvelope(envelopeOk('x', 7)))).toBe(true);
    expect(isErr(unwrapEnvelope(envelopeErr('x', toDexError('e'))))).toBe(true);
  });
});

describe('safeHandler', () => {
  it('returns ok envelope when handler resolves', async () => {
    const h = safeHandler('add', async (i: { a: number; b: number }) => i.a + i.b);
    const r = await h({ a: 2, b: 3 });
    expect(r.ok).toBe(true);
    expect(r.value).toBe(5);
  });

  it('returns err envelope when handler throws', async () => {
    const log = vi.fn();
    const h = safeHandler('boom', () => { throw new Error('nope'); }, { log });
    const r = await h({});
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe('nope');
    expect(log).toHaveBeenCalledWith('error', expect.stringContaining('handler threw'), expect.any(Object));
  });

  it('rejects payload that fails guard', async () => {
    const isStr = (v: unknown): v is string => typeof v === 'string';
    const log = vi.fn();
    const h = safeHandler('echo', (s: string) => s.toUpperCase(), { guard: isStr, log });
    const r = await h(42);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('E_IPC_GUARD');
    expect(log).toHaveBeenCalledWith('warn', 'guard rejected payload');
  });

  it('handler success does not log', async () => {
    const log = vi.fn();
    const h = safeHandler('ping', () => 'pong', { log });
    await h(undefined);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('callIpc', () => {
  it('returns err when bridge missing', async () => {
    const r = await callIpc(undefined, 'x');
    expect(isErr(r)).toBe(true);
  });

  it('returns ok when bridge resolves with envelope', async () => {
    const bridge = { invoke: vi.fn().mockResolvedValue(envelopeOk('y', 42)) };
    const r = await callIpc<number>(bridge, 'y', 'pl');
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(42);
    expect(bridge.invoke).toHaveBeenCalledWith('y', 'pl');
  });

  it('returns err when bridge transport rejects', async () => {
    const bridge = { invoke: vi.fn().mockRejectedValue(new Error('chan-down')) };
    const r = await callIpc(bridge, 'z');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe('E_IPC_TRANSPORT');
  });
});

describe('isStructuredCloneSafe', () => {
  it('accepts plain JSON-safe values', () => {
    expect(isStructuredCloneSafe({ a: 1, b: 'x', c: [true, null] })).toBe(true);
  });
  it('falls back gracefully on circular refs', () => {
    const a: any = {}; a.self = a;
    // safeJSON handles circulars, so it is technically safe.
    expect(isStructuredCloneSafe(a)).toBe(true);
  });
});
