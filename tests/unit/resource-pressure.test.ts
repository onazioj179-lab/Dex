// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { nextPressure, budgetUnderPressure } from '../../src/renderer/services/resourcePressure';

describe('resource coordinator', () => {
  it('levels from RAM in use', () => {
    expect(nextPressure('normal', 60)).toBe('normal');
    expect(nextPressure('normal', 82)).toBe('high');
    expect(nextPressure('normal', 93)).toBe('critical');
  });
  it('hysteresis: no flapping at a boundary', () => {
    expect(nextPressure('critical', 88)).toBe('critical'); // within 3 points of 90
    expect(nextPressure('critical', 86)).toBe('high');
    expect(nextPressure('high', 78)).toBe('high');         // within 3 points of 80
    expect(nextPressure('high', 76)).toBe('normal');
    expect(nextPressure('high', NaN)).toBe('high');
  });
  it('pressure only lowers the Browser budget, never raises it', () => {
    expect(budgetUnderPressure(5, 'normal')).toBe(5);
    expect(budgetUnderPressure(5, 'high')).toBe(1);
    expect(budgetUnderPressure(0, 'high')).toBe(0);
    expect(budgetUnderPressure(8, 'critical')).toBe(0);
  });
});
