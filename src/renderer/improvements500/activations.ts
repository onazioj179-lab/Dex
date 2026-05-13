// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Common neural network activation functions and their derivatives where
 * meaningful. All functions accept a single number and return a number.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function sigmoid(x: number): number {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

export function sigmoidDerivative(x: number): number {
  const s = sigmoid(x);
  return s * (1 - s);
}

export function relu(x: number): number {
  return x > 0 ? x : 0;
}

export function leakyRelu(x: number, alpha = 0.01): number {
  return x > 0 ? x : alpha * x;
}

export function elu(x: number, alpha = 1): number {
  return x > 0 ? x : alpha * (Math.exp(x) - 1);
}

export function gelu(x: number): number {
  const c = Math.sqrt(2 / Math.PI);
  return 0.5 * x * (1 + Math.tanh(c * (x + 0.044715 * x * x * x)));
}

export function softplus(x: number): number {
  return x > 30 ? x : Math.log1p(Math.exp(x));
}

export function swish(x: number): number {
  return x * sigmoid(x);
}

export function mish(x: number): number {
  return x * Math.tanh(softplus(x));
}
