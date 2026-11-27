// =============================================================================
// DEX Platform — ContextBus tests
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextBus } from '../../src/renderer/services/ContextBus';

describe('ContextBus', () => {
  beforeEach(() => {
    ContextBus._reset();
    ContextBus._setThrottle(0); // disable throttle for deterministic delivery
  });

  it('delivers payload to all subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    ContextBus.on('app:opened', a);
    ContextBus.on('app:opened', b);
    ContextBus.emit('app:opened', { appId: 'notes', ts: 1 });
    expect(a).toHaveBeenCalledWith({ appId: 'notes', ts: 1 });
    expect(b).toHaveBeenCalledWith({ appId: 'notes', ts: 1 });
  });

  it('on() returns an unsubscribe function', () => {
    const fn = vi.fn();
    const off = ContextBus.on('app:focused', fn);
    ContextBus.emit('app:focused', { appId: 'a', ts: 0 });
    off();
    ContextBus.emit('app:focused', { appId: 'b', ts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('once() fires exactly once', () => {
    const fn = vi.fn();
    ContextBus.once('app:closed', fn);
    ContextBus.emit('app:closed', { appId: 'a', ts: 0 });
    ContextBus.emit('app:closed', { appId: 'b', ts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throttles repeat emits within window', () => {
    ContextBus._setThrottle(50);
    const fn = vi.fn();
    ContextBus.on('app:focused', fn);
    ContextBus.emit('app:focused', { appId: 'a', ts: 0 });
    ContextBus.emit('app:focused', { appId: 'b', ts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('delivers every task completion in a burst', () => {
    ContextBus._setThrottle(50);
    const fn = vi.fn();
    ContextBus.on('task:completed', fn);
    ContextBus.emit('task:completed', { id: 'a', title: 'First task' });
    ContextBus.emit('task:completed', { id: 'b', title: 'Second task' });
    expect(fn.mock.calls).toEqual([[{ id: 'a', title: 'First task' }], [{ id: 'b', title: 'Second task' }]]);
  });

  it('replay() returns recent events on a channel', () => {
    ContextBus.emit('app:opened', { appId: 'a', ts: 0 });
    ContextBus.emit('app:opened', { appId: 'b', ts: 1 });
    const events = ContextBus.replay('app:opened');
    expect(events.map(e => (e.payload as any).appId)).toEqual(['a', 'b']);
  });

  it('onWithReplay() delivers most recent buffered event immediately', () => {
    ContextBus.emit('app:focused', { appId: 'first', ts: 0 });
    const fn = vi.fn();
    ContextBus.onWithReplay('app:focused', fn);
    expect(fn).toHaveBeenCalledWith({ appId: 'first', ts: 0 });
  });

  it('isolates errors in handlers (later handlers still fire)', () => {
    const good = vi.fn();
    ContextBus.on('app:opened', () => { throw new Error('boom'); });
    ContextBus.on('app:opened', good);
    expect(() => ContextBus.emit('app:opened', { appId: 'x', ts: 0 })).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('_stats() reports channel + subscriber + buffer counts', () => {
    ContextBus.on('app:opened', () => {});
    ContextBus.on('app:closed', () => {});
    ContextBus.emit('app:opened', { appId: 'a', ts: 0 });
    const stats = ContextBus._stats();
    expect(stats.channels).toBeGreaterThanOrEqual(2);
    expect(stats.subscribers).toBeGreaterThanOrEqual(2);
    expect(stats.buffered).toBeGreaterThanOrEqual(1);
  });

  it('ring buffer caps at 200 events', () => {
    for (let i = 0; i < 250; i++) {
      ContextBus.emit('app:focused', { appId: `a${i}`, ts: i });
    }
    const all = ContextBus.replay();
    expect(all.length).toBeLessThanOrEqual(200);
    // Most recent event should be a249
    expect((all[all.length - 1].payload as any).appId).toBe('a249');
  });
});
