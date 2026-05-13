// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Critically-damped second-order spring (Game Programming Gems 4 chapter 1.10
 * - "Critically Damped Spring Smoothing"). Smoother than naive springs because
 * it uses the analytical critically-damped solution.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface CritDampState {
  position: number;
  velocity: number;
}

export function criticallyDampedSmooth(
  state: CritDampState,
  target: number,
  smoothTime: number,
  dt: number,
): CritDampState {
  const omega = 2 / Math.max(1e-6, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.position - target;
  const temp = (state.velocity + omega * change) * dt;
  const newVelocity = (state.velocity - omega * temp) * exp;
  const newPosition = target + (change + temp) * exp;
  return { position: newPosition, velocity: newVelocity };
}
