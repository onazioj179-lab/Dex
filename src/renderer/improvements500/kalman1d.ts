// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Scalar 1-D Kalman filter. Tracks a single value (e.g. sensor
 * reading) under Gaussian process and observation noise.
 */

export interface Kalman1DOptions {
  /** Initial state estimate. */
  x?: number;
  /** Initial estimate variance (uncertainty). */
  p?: number;
  /** Process noise variance. */
  q?: number;
  /** Measurement noise variance. */
  r?: number;
}

export class Kalman1D {
  private xEst: number;
  private pEst: number;
  private readonly q: number;
  private readonly r: number;

  constructor(opts: Kalman1DOptions = {}) {
    this.xEst = opts.x ?? 0;
    this.pEst = opts.p ?? 1;
    this.q = opts.q ?? 1e-4;
    this.r = opts.r ?? 1e-2;
  }

  /** Incorporate a new measurement and return the updated estimate. */
  update(measurement: number): number {
    // Predict step (state model is identity for scalar)
    this.pEst += this.q;
    // Update step
    const k = this.pEst / (this.pEst + this.r);
    this.xEst += k * (measurement - this.xEst);
    this.pEst = (1 - k) * this.pEst;
    return this.xEst;
  }

  get value(): number {
    return this.xEst;
  }

  get variance(): number {
    return this.pEst;
  }
}
