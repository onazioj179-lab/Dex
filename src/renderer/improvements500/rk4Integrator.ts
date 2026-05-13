// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Classical 4th-order Runge-Kutta integrator for scalar ODE dy/dx = f(x, y).
export function rk4Step(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h: number,
): number {
  const k1 = f(x, y);
  const k2 = f(x + h / 2, y + (h * k1) / 2);
  const k3 = f(x + h / 2, y + (h * k2) / 2);
  const k4 = f(x + h, y + h * k3);
  return y + (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
}

export function rk4Solve(
  f: (x: number, y: number) => number,
  x0: number,
  y0: number,
  xEnd: number,
  steps: number,
): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(steps + 1);
  const y = new Float64Array(steps + 1);
  x[0] = x0;
  y[0] = y0;
  const h = (xEnd - x0) / steps;
  for (let i = 0; i < steps; i++) {
    y[i + 1] = rk4Step(f, x[i], y[i], h);
    x[i + 1] = x[i] + h;
  }
  return { x, y };
}
