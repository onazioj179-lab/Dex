// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Velocity Verlet integrator for second-order ODEs (e.g. spring-mass).
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface VerletState {
  x: number;
  v: number;
  a: number;
}

export type Acceleration = (x: number, v: number, t: number) => number;

export function verletStep(
  state: VerletState,
  accel: Acceleration,
  t: number,
  dt: number,
): VerletState {
  const xNext = state.x + state.v * dt + 0.5 * state.a * dt * dt;
  const aNext = accel(xNext, state.v, t + dt);
  const vNext = state.v + 0.5 * (state.a + aNext) * dt;
  return { x: xNext, v: vNext, a: aNext };
}

export function verletSolve(
  accel: Acceleration,
  x0: number,
  v0: number,
  tEnd: number,
  steps: number,
): { t: Float64Array; x: Float64Array; v: Float64Array } {
  if (!Number.isFinite(steps) || steps <= 0) throw new RangeError('verletSolve: steps must be positive');
  const dt = tEnd / steps;
  const tArr = new Float64Array(steps + 1);
  const xArr = new Float64Array(steps + 1);
  const vArr = new Float64Array(steps + 1);
  let state: VerletState = { x: x0, v: v0, a: accel(x0, v0, 0) };
  tArr[0] = 0;
  xArr[0] = x0;
  vArr[0] = v0;
  for (let i = 0; i < steps; i++) {
    state = verletStep(state, accel, i * dt, dt);
    tArr[i + 1] = (i + 1) * dt;
    xArr[i + 1] = state.x;
    vArr[i + 1] = state.v;
  }
  return { t: tArr, x: xArr, v: vArr };
}
