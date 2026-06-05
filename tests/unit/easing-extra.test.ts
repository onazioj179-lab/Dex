// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  easeInQuad, easeOutQuad, easeInOutQuad, easeOutBack, easeOutElastic, easeOutBounce,
} from '../../src/shared/creative/easingExtra';

const endpoints = (f: (x: number) => number) => {
  expect(f(0)).toBeCloseTo(0, 5);
  expect(f(1)).toBeCloseTo(1, 5);
};

describe('extended easings', () => {
  it('quad family', () => {
    endpoints(easeInQuad);
    endpoints(easeOutQuad);
    endpoints(easeInOutQuad);
    expect(easeInQuad(0.5)).toBe(0.25);
    expect(easeOutQuad(0.5)).toBe(0.75);
    expect(easeInOutQuad(0.5)).toBe(0.5);
  });

  it('back overshoots but pins endpoints', () => {
    endpoints(easeOutBack);
    // somewhere in the curve it exceeds 1 (overshoot)
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
  });

  it('elastic and bounce pin endpoints', () => {
    endpoints(easeOutElastic);
    endpoints(easeOutBounce);
    expect(easeOutBounce(0)).toBe(0);
  });
});
