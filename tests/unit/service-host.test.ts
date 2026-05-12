// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ServiceHost lifecycle tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ServiceHost } from '../../src/main/services/ServiceHost';

describe('ServiceHost', () => {
  let host: ServiceHost;

  beforeEach(() => {
    host = new ServiceHost();
  });

  it('starts services in registration order and reports running state', async () => {
    const order: string[] = [];
    host.register({
      id: 'svc.a', name: 'A',
      start: () => { order.push('a'); },
    });
    host.register({
      id: 'svc.b', name: 'B',
      start: async () => { order.push('b'); },
    });

    await host.start();

    expect(order).toEqual(['a', 'b']);
    const snap = host.snapshot();
    expect(snap.map((s) => s.state)).toEqual(['running', 'running']);
  });

  it('rejects duplicate registration', () => {
    host.register({ id: 'dup', name: 'Dup', start: () => {} });
    expect(() => host.register({ id: 'dup', name: 'Dup2', start: () => {} }))
      .toThrow(/duplicate/);
  });

  it('records failures without aborting subsequent services', async () => {
    host.register({
      id: 'svc.bad', name: 'Bad',
      start: () => { throw new Error('boom'); },
    });
    let okStarted = false;
    host.register({
      id: 'svc.ok', name: 'Ok',
      start: () => { okStarted = true; },
    });

    await host.start();

    expect(okStarted).toBe(true);
    const snap = host.snapshot();
    expect(snap[0].state).toBe('failed');
    expect(snap[0].failures).toBe(1);
    expect(snap[1].state).toBe('running');
  });

  it('skips services whose dependency did not run', async () => {
    host.register({
      id: 'svc.dep', name: 'Dep',
      start: () => { throw new Error('nope'); },
    });
    host.register({
      id: 'svc.child', name: 'Child',
      dependsOn: ['svc.dep'],
      start: () => {},
    });

    await host.start();

    const child = host.snapshot().find((s) => s.id === 'svc.child');
    expect(child?.state).toBe('failed');
    expect(child?.message).toMatch(/dependency/);
  });

  it('stops services in reverse order and is idempotent', async () => {
    const order: string[] = [];
    host.register({
      id: 'svc.first', name: 'First',
      start: () => {},
      stop: () => { order.push('first'); },
    });
    host.register({
      id: 'svc.second', name: 'Second',
      start: () => {},
      stop: () => { order.push('second'); },
    });

    await host.start();
    await host.stop();
    await host.stop(); // idempotent

    expect(order).toEqual(['second', 'first']);
  });

  it('marks unhealthy services as degraded', async () => {
    host.register({ id: 'svc.x', name: 'X', start: () => {} });
    await host.start();
    host.markUnhealthy('svc.x', 'cpu spike');
    const snap = host.snapshot()[0];
    expect(snap.state).toBe('degraded');
    expect(snap.message).toBe('cpu spike');
    expect(snap.failures).toBe(1);
  });

  it('runs probes via health() and downgrades state when probe returns false', async () => {
    let healthy = true;
    host.register({
      id: 'svc.p', name: 'P',
      start: () => {},
      probe: () => healthy,
    });
    await host.start();

    let h = await host.health('svc.p');
    expect(h.ok).toBe(true);
    expect(h.state).toBe('running');

    healthy = false;
    h = await host.health('svc.p');
    expect(h.ok).toBe(false);
    expect(h.state).toBe('degraded');
  });

  it('restart re-runs start for a single service', async () => {
    let starts = 0;
    let stops = 0;
    host.register({
      id: 'svc.r', name: 'R',
      start: () => { starts += 1; },
      stop: () => { stops += 1; },
    });
    await host.start();
    expect(starts).toBe(1);
    await host.restart('svc.r');
    expect(starts).toBe(2);
    expect(stops).toBe(1);
  });

  it('enforces start timeout and records failure', async () => {
    host.register({
      id: 'svc.slow', name: 'Slow',
      timeoutMs: 30,
      start: () => new Promise<void>(() => { /* never resolves */ }),
    });
    await host.start();
    const snap = host.snapshot()[0];
    expect(snap.state).toBe('failed');
    expect(snap.message).toMatch(/exceeded 30ms/);
  });

  it('health() on an unknown id reports failed', async () => {
    const h = await host.health('does.not.exist');
    expect(h.ok).toBe(false);
    expect(h.state).toBe('failed');
  });
});
