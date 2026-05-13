// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Inertia / momentum integrator for zoom and pan gestures. Given a starting
 * value and velocity, advances toward rest using exponential decay. Pure
 * function plus a class wrapper for stepwise integration.
 */

export interface InertiaState {
  value: number;
  velocity: number;
}

/** Exponential decay: v *= exp(-friction * dt); x += v * dt. */
export function stepInertia(
  state: InertiaState,
  dtMs: number,
  friction: number,
): InertiaState {
  if (dtMs <= 0) return state;
  const dt = dtMs / 1000;
  const decay = Math.exp(-friction * dt);
  const newV = state.velocity * decay;
  // Closed-form integral of v0*exp(-k*t) from 0..dt is v0*(1-decay)/k
  const dx = friction === 0
    ? state.velocity * dt
    : (state.velocity * (1 - decay)) / friction;
  return { value: state.value + dx, velocity: newV };
}

export class ZoomInertia {
  private value: number;
  private velocity: number;
  private friction: number;
  private minVelocity: number;

  constructor(initial = 1, friction = 4, minVelocity = 0.01) {
    this.value = initial;
    this.velocity = 0;
    this.friction = friction;
    this.minVelocity = minVelocity;
  }

  set(value: number, velocity = 0): void {
    this.value = value;
    this.velocity = velocity;
  }

  get(): number {
    return this.value;
  }

  isResting(): boolean {
    return Math.abs(this.velocity) < this.minVelocity;
  }

  step(dtMs: number): number {
    const next = stepInertia({ value: this.value, velocity: this.velocity }, dtMs, this.friction);
    this.value = next.value;
    this.velocity = next.velocity;
    if (Math.abs(this.velocity) < this.minVelocity) this.velocity = 0;
    return this.value;
  }

  clampTo(min: number, max: number): void {
    if (this.value < min) {
      this.value = min;
      if (this.velocity < 0) this.velocity = 0;
    } else if (this.value > max) {
      this.value = max;
      if (this.velocity > 0) this.velocity = 0;
    }
  }
}
