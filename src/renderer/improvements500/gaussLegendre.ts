// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Gauss-Legendre quadrature on [a, b]. Supports 2-, 3-, 4-, and 5-point rules.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
const NODES: Record<number, { x: number[]; w: number[] }> = {
  2: { x: [-0.5773502691896257, 0.5773502691896257], w: [1, 1] },
  3: {
    x: [-0.7745966692414834, 0, 0.7745966692414834],
    w: [0.5555555555555556, 0.8888888888888888, 0.5555555555555556],
  },
  4: {
    x: [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526],
    w: [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538],
  },
  5: {
    x: [-0.9061798459386640, -0.5384693101056831, 0, 0.5384693101056831, 0.9061798459386640],
    w: [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891],
  },
};

export function gaussLegendreIntegrate(
  f: (x: number) => number,
  a: number,
  b: number,
  points: 2 | 3 | 4 | 5 = 5,
): number {
  const node = NODES[points];
  if (!node) throw new RangeError('gaussLegendreIntegrate: points must be 2, 3, 4, or 5');
  const half = (b - a) / 2;
  const mid = (a + b) / 2;
  let sum = 0;
  for (let i = 0; i < node.x.length; i++) sum += node.w[i]! * f(mid + half * node.x[i]!);
  return half * sum;
}
