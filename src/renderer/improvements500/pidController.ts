// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PID controller with optional output clamping and anti-windup via
 * conditional integration.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface PidConfig {
  kp: number;
  ki: number;
  kd: number;
  outMin?: number;
  outMax?: number;
}

export class PidController {
  private kp: number;
  private ki: number;
  private kd: number;
  private outMin: number;
  private outMax: number;
  private integral = 0;
  private prevError = 0;
  private hasPrev = false;

  constructor(cfg: PidConfig) {
    this.kp = cfg.kp;
    this.ki = cfg.ki;
    this.kd = cfg.kd;
    this.outMin = cfg.outMin ?? Number.NEGATIVE_INFINITY;
    this.outMax = cfg.outMax ?? Number.POSITIVE_INFINITY;
  }

  step(setpoint: number, measurement: number, dt: number): number {
    if (!(dt > 0)) throw new RangeError('PidController.step: dt must be positive');
    const error = setpoint - measurement;
    const proposedI = this.integral + error * dt;
    const derivative = this.hasPrev ? (error - this.prevError) / dt : 0;
    let raw = this.kp * error + this.ki * proposedI + this.kd * derivative;
    let output = raw;
    if (output > this.outMax) output = this.outMax;
    else if (output < this.outMin) output = this.outMin;
    // Conditional integration: only update integral when not saturating in the same direction.
    if (output === raw || (output === this.outMax && error < 0) || (output === this.outMin && error > 0)) {
      this.integral = proposedI;
    }
    this.prevError = error;
    this.hasPrev = true;
    return output;
  }

  reset(): void {
    this.integral = 0;
    this.prevError = 0;
    this.hasPrev = false;
  }
}
