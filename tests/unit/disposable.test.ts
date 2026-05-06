// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DisposableGroup, makeDisposable, toTeardown } from '../../src/shared/disposable';

describe('DisposableGroup', () => {
  it('runs teardowns LIFO on dispose', () => {
    const order: number[] = [];
    const g = new DisposableGroup();
    g.add(() => order.push(1));
    g.add(() => order.push(2));
    g.add(() => order.push(3));
    g.dispose();
    expect(order).toEqual([3, 2, 1]);
  });

  it('is idempotent', () => {
    const fn = vi.fn();
    const g = new DisposableGroup();
    g.add(fn);
    g.dispose();
    g.dispose();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('swallows individual teardown errors', () => {
    const second = vi.fn();
    const g = new DisposableGroup();
    g.add(() => { throw new Error('bang'); });
    g.add(second);
    expect(() => g.dispose()).not.toThrow();
    expect(second).toHaveBeenCalled();
  });

  it('runs late-adds immediately when already disposed', () => {
    const fn = vi.fn();
    const g = new DisposableGroup();
    g.dispose();
    g.add(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('addInterval + addTimeout clear on dispose', () => {
    const g = new DisposableGroup();
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const id = 999 as unknown as ReturnType<typeof setInterval>;
    g.addInterval(id);
    g.dispose();
    expect(clear).toHaveBeenCalledWith(id);
    clear.mockRestore();
  });

  it('isDisposed reflects state', () => {
    const g = new DisposableGroup();
    expect(g.isDisposed).toBe(false);
    g.dispose();
    expect(g.isDisposed).toBe(true);
  });
});

describe('makeDisposable', () => {
  it('calls teardown once', () => {
    const fn = vi.fn();
    const d = makeDisposable(fn);
    d.dispose();
    d.dispose();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('toTeardown', () => {
  it('wraps function', () => {
    const fn = vi.fn();
    const t = toTeardown(fn);
    t();
    expect(fn).toHaveBeenCalled();
  });

  it('wraps {dispose}', () => {
    const obj = { dispose: vi.fn() };
    toTeardown(obj)();
    expect(obj.dispose).toHaveBeenCalled();
  });

  it('wraps {unsubscribe}', () => {
    const obj = { unsubscribe: vi.fn() };
    toTeardown(obj)();
    expect(obj.unsubscribe).toHaveBeenCalled();
  });
});
