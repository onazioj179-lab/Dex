// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { classifyBurst } from '../../src/renderer/services/ThermalAdaptiveMonitor';

describe('thermal monitor burst classification', () => {
  it('maps slow medians to warm / hot / critical', () => {
    expect(classifyBurst(25, 0, 'cool', 0).level).toBe('warm');
    expect(classifyBurst(40, 0, 'cool', 0).level).toBe('hot');
    expect(classifyBurst(60, 0, 'cool', 0).level).toBe('critical');
    expect(classifyBurst(16, 5, 'cool', 0).level).toBe('warm'); // long-task pressure
  });

  it('steps back to cool only after three clean bursts', () => {
    let r = classifyBurst(16.6, 0, 'hot', 0);
    expect(r.level).toBe('hot');
    r = classifyBurst(16.6, 0, r.level, r.clean);
    expect(r.level).toBe('hot');
    r = classifyBurst(16.6, 0, r.level, r.clean);
    expect(r.level).toBe('cool');
  });
});
