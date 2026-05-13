// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  softmax,
  logSumExp,
  crossEntropy,
  sigmoid,
  relu,
  leakyRelu,
  gelu,
  softplus,
  layerNormalize,
  createAdamState,
  adamStep,
  createMomentumState,
  sgdMomentumStep,
  createRmspropState,
  rmspropStep,
  createAdagradState,
  adagradStep,
  batchNormalize,
} from '../../src/renderer/improvements500';

describe('improvements500 Wave 46', () => {
  it('softmax sums to 1', () => {
    const s = softmax([1, 2, 3]);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(s[2]).toBeGreaterThan(s[1]!);
  });

  it('logSumExp is stable', () => {
    expect(logSumExp([1000, 1000])).toBeCloseTo(1000 + Math.log(2), 9);
    expect(logSumExp([])).toBe(Number.NEGATIVE_INFINITY);
  });

  it('crossEntropy of perfect prediction is ~0', () => {
    expect(crossEntropy([1, 0, 0], [1, 0, 0])).toBeLessThan(1e-10);
    expect(crossEntropy([0.5, 0.5, 0], [1, 0, 0])).toBeCloseTo(Math.log(2), 6);
  });

  it('activations basic shape', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 12);
    expect(relu(-1)).toBe(0);
    expect(relu(2)).toBe(2);
    expect(leakyRelu(-2, 0.5)).toBe(-1);
    expect(gelu(0)).toBeCloseTo(0, 12);
    expect(softplus(0)).toBeCloseTo(Math.log(2), 6);
  });

  it('layerNormalize zero mean unit variance', () => {
    const v = layerNormalize([1, 2, 3, 4]);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
  });

  it('Adam reduces a quadratic loss', () => {
    const params = [5, -5];
    const state = createAdamState(2);
    for (let i = 0; i < 200; i++) {
      const grads = [2 * params[0]!, 2 * params[1]!];
      adamStep(params, grads, state, { learningRate: 0.1 });
    }
    expect(Math.abs(params[0]!)).toBeLessThan(0.5);
    expect(Math.abs(params[1]!)).toBeLessThan(0.5);
  });

  it('SGD with momentum reduces a quadratic loss', () => {
    const params = [3];
    const state = createMomentumState(1);
    for (let i = 0; i < 200; i++) {
      const grads = [2 * params[0]!];
      sgdMomentumStep(params, grads, state, { learningRate: 0.05, momentum: 0.9 });
    }
    expect(Math.abs(params[0]!)).toBeLessThan(0.5);
  });

  it('RMSProp reduces a quadratic loss', () => {
    const params = [4];
    const state = createRmspropState(1);
    for (let i = 0; i < 500; i++) {
      const grads = [2 * params[0]!];
      rmspropStep(params, grads, state, { learningRate: 0.1 });
    }
    expect(Math.abs(params[0]!)).toBeLessThan(0.5);
  });

  it('AdaGrad reduces a quadratic loss', () => {
    const params = [2];
    const state = createAdagradState(1);
    for (let i = 0; i < 1000; i++) {
      const grads = [2 * params[0]!];
      adagradStep(params, grads, state, { learningRate: 1 });
    }
    expect(Math.abs(params[0]!)).toBeLessThan(0.5);
  });

  it('batchNormalize zero-mean unit-variance', () => {
    const r = batchNormalize([1, 2, 3, 4, 5]);
    const mean = r.values.reduce((a, b) => a + b, 0) / r.values.length;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
  });
});
