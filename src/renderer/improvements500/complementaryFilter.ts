// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Complementary filter for fusing accelerometer and gyroscope angle
 * estimates. Returns a fused angle in radians.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export class ComplementaryFilter {
  private angle: number;
  private alpha: number;

  /**
   * @param alpha weight for the gyro path in [0, 1]. Typical value ~0.98.
   * @param initialAngle starting angle in radians.
   */
  constructor(alpha = 0.98, initialAngle = 0) {
    if (!(alpha >= 0 && alpha <= 1)) throw new RangeError('ComplementaryFilter: alpha must be in [0,1]');
    this.alpha = alpha;
    this.angle = initialAngle;
  }

  step(gyroRate: number, accelAngle: number, dt: number): number {
    if (!(dt > 0)) throw new RangeError('ComplementaryFilter.step: dt must be positive');
    this.angle = this.alpha * (this.angle + gyroRate * dt) + (1 - this.alpha) * accelAngle;
    return this.angle;
  }

  current(): number {
    return this.angle;
  }

  reset(angle = 0): void {
    this.angle = angle;
  }
}
