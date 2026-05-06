// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/shared/eventBus';

type TestEvents = { 'user:login': { id: string }; 'user:logout': void; 'count': number };

describe('EventBus', () => {
  it('delivers payload to all listeners', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('user:login', a);
    bus.on('user:login', b);
    bus.emit('user:login', { id: '123' });
    expect(a).toHaveBeenCalledWith({ id: '123' });
    expect(b).toHaveBeenCalledWith({ id: '123' });
  });

  it('on() returns disposable that removes listener', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const sub = bus.on('count', fn);
    bus.emit('count', 1);
    sub.dispose();
    bus.emit('count', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('once() fires exactly once', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.once('count', fn);
    bus.emit('count', 1);
    bus.emit('count', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('off() removes specific listener', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('count', fn);
    bus.off('count', fn);
    bus.emit('count', 5);
    expect(fn).not.toHaveBeenCalled();
  });

  it('clear(event) removes only that event', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('count', a);
    bus.on('user:login', b);
    bus.clear('count');
    bus.emit('count', 1);
    bus.emit('user:login', { id: 'x' });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('swallows listener errors without stopping delivery', () => {
    const bus = new EventBus<TestEvents>();
    const good = vi.fn();
    bus.on('count', () => { throw new Error('boom'); });
    bus.on('count', good);
    expect(() => bus.emit('count', 1)).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('listenerCount tracks correctly', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const sub = bus.on('count', fn);
    expect(bus.listenerCount('count')).toBe(1);
    sub.dispose();
    expect(bus.listenerCount('count')).toBe(0);
  });
});
