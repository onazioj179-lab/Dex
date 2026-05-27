// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use a fresh import each test by re-importing after resetting module cache
vi.resetModules();

let balancer: typeof import('../../src/renderer/services/IdleResourceBalancer');
let registry: typeof import('../../src/renderer/services/CacheRegistry');

beforeEach(async () => {
  vi.resetModules();
  balancer = await import('../../src/renderer/services/IdleResourceBalancer');
  registry = await import('../../src/renderer/services/CacheRegistry');
  // Ensure stopped
  balancer._stopIdleResourceBalancer();
  // Clear registry
  const snap = registry.getCacheSnapshot();
  snap.forEach(e => registry.unregisterCache(e.id));
});

afterEach(() => {
  balancer._stopIdleResourceBalancer();
});

describe('IdleResourceBalancer', () => {
  it('startIdleResourceBalancer is idempotent', () => {
    balancer.startIdleResourceBalancer();
    balancer.startIdleResourceBalancer();
    expect(balancer.isIdleBalancerStarted()).toBe(true);
  });

  it('isIdleBalancerStarted returns false before start and after stop', () => {
    expect(balancer.isIdleBalancerStarted()).toBe(false);
    balancer.startIdleResourceBalancer();
    expect(balancer.isIdleBalancerStarted()).toBe(true);
    balancer._stopIdleResourceBalancer();
    expect(balancer.isIdleBalancerStarted()).toBe(false);
  });

  it('idle event flushes registered caches', () => {
    const flushSpy = vi.fn(() => 512);
    registry.registerCache({ name: 'TestCache', flush: flushSpy });

    balancer.startIdleResourceBalancer();
    window.dispatchEvent(new CustomEvent('dex:idle-pause', { detail: { reason: 'hidden' } }));

    expect(flushSpy).toHaveBeenCalledOnce();
  });

  it('idle event emits dex:worker-throttle with throttled=true', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('dex:worker-throttle', handler);

    balancer.startIdleResourceBalancer();
    window.dispatchEvent(new CustomEvent('dex:idle-pause', { detail: { reason: 'blur' } }));

    window.removeEventListener('dex:worker-throttle', handler);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1].detail.throttled).toBe(true);
  });

  it('resume event emits dex:worker-throttle with throttled=false', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('dex:worker-throttle', handler);

    balancer.startIdleResourceBalancer();
    window.dispatchEvent(new CustomEvent('dex:idle-resume', { detail: { reason: 'focus' } }));

    window.removeEventListener('dex:worker-throttle', handler);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1].detail.throttled).toBe(false);
  });

  it('does not flush caches before start', () => {
    const flushSpy = vi.fn(() => 0);
    registry.registerCache({ name: 'Passive', flush: flushSpy });
    window.dispatchEvent(new CustomEvent('dex:idle-pause', { detail: { reason: 'hidden' } }));
    expect(flushSpy).not.toHaveBeenCalled();
  });
});
