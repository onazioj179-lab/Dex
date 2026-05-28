// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import {
  FrameScheduler, gpuPressure, selectQualityTier,
} from '../../src/shared/phase4/scheduler';

describe('Phase 4 - FrameScheduler', () => {
  it('runs higher-priority tasks first', () => {
    const s = new FrameScheduler();
    const order: string[] = [];
    s.enqueue({ id: 'bg', priority: 'background', estCostMs: 1, run: () => order.push('bg') });
    s.enqueue({ id: 'inp', priority: 'input', estCostMs: 1, run: () => order.push('inp') });
    s.enqueue({ id: 'anim', priority: 'animation', estCostMs: 1, run: () => order.push('anim') });
    const r = s.runFrame(10);
    expect(order).toEqual(['inp', 'anim', 'bg']);
    expect(r.deferred).toEqual([]);
    expect(s.size()).toBe(0);
  });

  it('defers tasks that exceed budget', () => {
    const s = new FrameScheduler();
    s.enqueue({ id: 'a', priority: 'input', estCostMs: 5, run: () => {} });
    s.enqueue({ id: 'b', priority: 'input', estCostMs: 8, run: () => {} });
    const r = s.runFrame(10);
    expect(r.ran).toEqual(['a']);
    expect(r.deferred).toEqual(['b']);
    expect(s.size()).toBe(1);
  });

  it('isolates throwing tasks', () => {
    const s = new FrameScheduler();
    const ok = vi.fn();
    s.enqueue({ id: 'bad', priority: 'input', estCostMs: 1, run: () => { throw new Error(); } });
    s.enqueue({ id: 'good', priority: 'input', estCostMs: 1, run: ok });
    s.runFrame(5);
    expect(ok).toHaveBeenCalled();
  });

  it('zero budget defers everything', () => {
    const s = new FrameScheduler();
    s.enqueue({ id: 'a', priority: 'input', estCostMs: 1, run: () => {} });
    const r = s.runFrame(0);
    expect(r.ran).toEqual([]);
    expect(r.deferred).toEqual(['a']);
  });

  it('rejects duplicate ids and supports cancel', () => {
    const s = new FrameScheduler();
    s.enqueue({ id: 'a', priority: 'input', estCostMs: 1, run: () => {} });
    expect(() => s.enqueue({ id: 'a', priority: 'input', estCostMs: 1, run: () => {} })).toThrow();
    expect(s.cancel('a')).toBe(true);
    expect(s.cancel('missing')).toBe(false);
  });
});

describe('Phase 4 - gpuPressure', () => {
  it('classifies levels', () => {
    expect(gpuPressure({ usedBytes: 0, totalBytes: 100 })).toBe('low');
    expect(gpuPressure({ usedBytes: 65, totalBytes: 100 })).toBe('medium');
    expect(gpuPressure({ usedBytes: 85, totalBytes: 100 })).toBe('high');
    expect(gpuPressure({ usedBytes: 95, totalBytes: 100 })).toBe('critical');
    expect(gpuPressure({ usedBytes: 0, totalBytes: 0 })).toBe('critical');
  });
});

describe('Phase 4 - selectQualityTier', () => {
  it('eco when battery saver or thermal throttle', () => {
    expect(selectQualityTier({ frameTimeP95Ms: 8, gpuPressure: 'low', batterySaver: true })).toBe('eco');
    expect(selectQualityTier({ frameTimeP95Ms: 8, gpuPressure: 'low', thermalThrottling: true })).toBe('eco');
  });

  it('ultra when everything is good', () => {
    expect(selectQualityTier({ frameTimeP95Ms: 8, gpuPressure: 'low' })).toBe('ultra');
  });

  it('balanced under medium pressure or moderate frame time', () => {
    expect(selectQualityTier({ frameTimeP95Ms: 25, gpuPressure: 'low' })).toBe('balanced');
    expect(selectQualityTier({ frameTimeP95Ms: 8, gpuPressure: 'high' })).toBe('balanced');
  });

  it('eco when critical or very slow', () => {
    expect(selectQualityTier({ frameTimeP95Ms: 8, gpuPressure: 'critical' })).toBe('eco');
    expect(selectQualityTier({ frameTimeP95Ms: 40, gpuPressure: 'low' })).toBe('eco');
  });
});
