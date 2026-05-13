// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Spring-damper one-dimensional smoothing toward a target. Useful for UI
 * animations and camera follow logic.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface SpringState {
  position: number;
  velocity: number;
}

export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export function springStep(
  state: SpringState,
  target: number,
  dt: number,
  config: SpringConfig = {},
): SpringState {
  const k = config.stiffness ?? 170;
  const c = config.damping ?? 26;
  const m = config.mass ?? 1;
  const force = -k * (state.position - target) - c * state.velocity;
  const acc = force / m;
  const velocity = state.velocity + acc * dt;
  const position = state.position + velocity * dt;
  return { position, velocity };
}
