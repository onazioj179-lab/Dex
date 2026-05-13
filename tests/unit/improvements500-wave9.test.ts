// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  AsyncQueue,
  createLimiter,
  CircuitBreaker,
  CircuitBreakerOpenError,
  TokenBucket,
  MovingAverage,
  ExponentialMovingAverage,
  combineAbortSignals,
  abortPromise,
  SvgPathBuilder,
  roundedRectPath,
  escapeXml,
  unescapeHtml,
  lengthToPx,
  pxToLength,
  timeToMs,
  bytesTo,
  toBytes,
  parseRgba,
  compositeOver,
  toPremultiplied,
  fromPremultiplied,
  screenBlend,
  toRgbaString,
} from '../../src/renderer/improvements500';

describe('AsyncQueue', () => {
  it('runs tasks one at a time in FIFO order', async () => {
    const q = new AsyncQueue();
    const order: number[] = [];
    const r1 = q.enqueue(async () => { order.push(1); return 'a'; });
    const r2 = q.enqueue(async () => { order.push(2); return 'b'; });
    const r3 = q.enqueue(async () => { order.push(3); return 'c'; });
    expect(await Promise.all([r1, r2, r3])).toEqual(['a', 'b', 'c']);
    expect(order).toEqual([1, 2, 3]);
  });
  it('one rejection does not break subsequent tasks', async () => {
    const q = new AsyncQueue();
    const r1 = q.enqueue(async () => { throw new Error('boom'); });
    const r2 = q.enqueue(async () => 'ok');
    await expect(r1).rejects.toThrow('boom');
    expect(await r2).toBe('ok');
  });
});

describe('createLimiter', () => {
  it('respects max concurrency', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const make = () => limit(async () => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active -= 1; return 1;
    });
    await Promise.all([make(), make(), make(), make(), make()]);
    expect(peak).toBeLessThanOrEqual(2);
  });
  it('rejects bad max', () => {
    expect(() => createLimiter(0)).toThrow();
  });
});

describe('CircuitBreaker', () => {
  it('opens after threshold failures and rejects fast', async () => {
    let now = 0;
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100, now: () => now });
    await expect(cb.exec(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(cb.exec(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(cb.exec(async () => 'ok')).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    now = 200;
    // half-open trial succeeds -> closed
    expect(await cb.exec(async () => 'ok')).toBe('ok');
    expect(cb.currentState).toBe('closed');
  });
});

describe('TokenBucket', () => {
  it('tryConsume succeeds while tokens available', () => {
    let now = 0;
    const b = new TokenBucket({ capacity: 3, refillPerMs: 0.001, initial: 3, now: () => now });
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(false);
    now = 1000; // refill 1 token
    expect(b.tryConsume()).toBe(true);
  });
  it('msUntilAvailable computes wait', () => {
    let now = 0;
    const b = new TokenBucket({ capacity: 1, refillPerMs: 0.001, initial: 0, now: () => now });
    expect(b.msUntilAvailable(1)).toBe(1000);
  });
});

describe('MovingAverage / EMA', () => {
  it('moving average rolls over capacity', () => {
    const ma = new MovingAverage(3);
    expect(ma.push(1)).toBe(1);
    expect(ma.push(3)).toBe(2);
    expect(ma.push(5)).toBe(3);
    expect(ma.push(7)).toBe(5); // window now [3,5,7]
  });
  it('EMA converges toward steady value', () => {
    const ema = new ExponentialMovingAverage(0.5);
    ema.push(10);
    for (let i = 0; i < 20; i += 1) ema.push(0);
    expect(Math.abs(ema.value())).toBeLessThan(0.1);
  });
});

describe('AbortGroup', () => {
  it('combines signals - aborts when any aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const grp = combineAbortSignals([a.signal, b.signal]);
    expect(grp.signal.aborted).toBe(false);
    a.abort('first');
    expect(grp.signal.aborted).toBe(true);
  });
  it('already-aborted input propagates immediately', () => {
    const a = new AbortController();
    a.abort('pre');
    const grp = combineAbortSignals([a.signal]);
    expect(grp.signal.aborted).toBe(true);
  });
  it('abortPromise rejects on signal abort', async () => {
    const c = new AbortController();
    const p = abortPromise(c.signal);
    c.abort('cancel');
    await expect(p).rejects.toBeDefined();
  });
});

describe('SvgPathBuilder', () => {
  it('builds rounded rect path', () => {
    const d = roundedRectPath(0, 0, 10, 10, 2);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.includes('A2 2')).toBe(true);
  });
  it('precision rounds coords', () => {
    const b = new SvgPathBuilder({ precision: 1 });
    expect(b.moveTo(1.234, 2.567).build()).toBe('M1.2 2.6');
  });
});

describe('xmlEscape', () => {
  it('escapes critical chars', () => {
    expect(escapeXml('<a href="x" v=\'y\'>&')).toBe('&lt;a href=&quot;x&quot; v=&#39;y&#39;&gt;&amp;');
  });
  it('unescapes', () => {
    expect(unescapeHtml('&amp;&lt;&gt;&quot;&#39;&apos;')).toBe('&<>"\'\'');
  });
});

describe('unitConvert', () => {
  it('length round-trips via px', () => {
    expect(lengthToPx(1, 'in')).toBe(96);
    expect(pxToLength(96, 'in')).toBe(1);
    expect(lengthToPx(1, 'cm')).toBeCloseTo(37.795, 2);
  });
  it('time conversions', () => {
    expect(timeToMs(2, 's')).toBe(2000);
    expect(timeToMs(1, 'h')).toBe(3_600_000);
  });
  it('bytes conversions', () => {
    expect(bytesTo(1024, 'KB')).toBe(1);
    expect(toBytes(1, 'MB')).toBe(1024 * 1024);
    expect(bytesTo(1000, 'KB', 1000)).toBe(1);
  });
});

describe('colorBlend', () => {
  it('parseRgba handles rgba and hex', () => {
    expect(parseRgba('rgba(10, 20, 30, 0.5)').a).toBe(0.5);
    expect(parseRgba('#000').a).toBe(1);
  });
  it('compositeOver: opaque src wins', () => {
    const out = compositeOver({ r: 255, g: 0, b: 0, a: 1 }, { r: 0, g: 0, b: 255, a: 1 });
    expect(out.r).toBe(255);
    expect(out.b).toBe(0);
    expect(out.a).toBe(1);
  });
  it('premultiplied round-trip preserves color (a > 0)', () => {
    const c = { r: 100, g: 150, b: 200, a: 0.5 };
    const p = toPremultiplied(c);
    const back = fromPremultiplied(p);
    expect(back.r).toBeCloseTo(100);
    expect(back.g).toBeCloseTo(150);
    expect(back.b).toBeCloseTo(200);
  });
  it('screen blend lightens', () => {
    const out = screenBlend({ r: 100, g: 100, b: 100 }, { r: 100, g: 100, b: 100 });
    expect(out.r).toBeGreaterThan(100);
  });
  it('toRgbaString formats stably', () => {
    expect(toRgbaString({ r: 1.4, g: 2.6, b: 3, a: 0.5 })).toBe('rgba(1, 3, 3, 0.5)');
  });
});

describe('integration: limiter + queue under load', () => {
  it('does not deadlock', async () => {
    const q = new AsyncQueue();
    const limit = createLimiter(3);
    const work = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 1;
    });
    const promises: Array<Promise<unknown>> = [];
    for (let i = 0; i < 10; i += 1) {
      promises.push(q.enqueue(() => limit(work)));
    }
    await Promise.all(promises);
    expect(work).toHaveBeenCalledTimes(10);
  });
});
