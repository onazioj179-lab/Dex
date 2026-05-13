// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 2D constant-velocity Kalman filter. State = [x, y, vx, vy].
 * Measurement = [x, y]. Suitable for tracking smoothed positions.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface Kalman2dOptions {
  processNoise?: number;
  measurementNoise?: number;
}

export interface Kalman2dState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// 4x4 matrix helpers using flat arrays in row-major order.
function mulMat4(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[i * 4 + k]! * b[k * 4 + j]!;
      out[i * 4 + j] = s;
    }
  }
  return out;
}

function transposeMat4(a: Float64Array): Float64Array {
  const out = new Float64Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[j * 4 + i] = a[i * 4 + j]!;
  return out;
}

export class Kalman2d {
  private state: Float64Array; // 4x1
  private P: Float64Array; // 4x4 covariance
  private q: number;
  private r: number;

  constructor(initial: Kalman2dState = { x: 0, y: 0, vx: 0, vy: 0 }, options: Kalman2dOptions = {}) {
    this.state = new Float64Array([initial.x, initial.y, initial.vx, initial.vy]);
    this.P = new Float64Array(16);
    for (let i = 0; i < 4; i++) this.P[i * 4 + i] = 1;
    this.q = options.processNoise ?? 1e-3;
    this.r = options.measurementNoise ?? 1e-1;
  }

  predict(dt: number): void {
    const F = new Float64Array([1, 0, dt, 0, 0, 1, 0, dt, 0, 0, 1, 0, 0, 0, 0, 1]);
    // x = F x
    const ns = new Float64Array(4);
    for (let i = 0; i < 4; i++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += F[i * 4 + k]! * this.state[k]!;
      ns[i] = s;
    }
    this.state = ns;
    // P = F P F^T + Q
    const FP = mulMat4(F, this.P);
    const FPFt = mulMat4(FP, transposeMat4(F));
    for (let i = 0; i < 4; i++) FPFt[i * 4 + i] = FPFt[i * 4 + i]! + this.q;
    this.P = FPFt;
  }

  update(zx: number, zy: number): void {
    // Innovation y = z - H x ; H selects [x,y]
    const yx = zx - this.state[0]!;
    const yy = zy - this.state[1]!;
    // S = H P H^T + R == 2x2 block of P[0..1,0..1] + R*I
    const S00 = this.P[0]! + this.r;
    const S01 = this.P[1]!;
    const S10 = this.P[4]!;
    const S11 = this.P[5]! + this.r;
    const det = S00 * S11 - S01 * S10;
    if (det === 0) return;
    const invS00 = S11 / det;
    const invS01 = -S01 / det;
    const invS10 = -S10 / det;
    const invS11 = S00 / det;
    // K = P H^T S^-1 (4x2)
    const K = new Float64Array(8);
    for (let i = 0; i < 4; i++) {
      const p0 = this.P[i * 4 + 0]!;
      const p1 = this.P[i * 4 + 1]!;
      K[i * 2 + 0] = p0 * invS00 + p1 * invS10;
      K[i * 2 + 1] = p0 * invS01 + p1 * invS11;
    }
    // x = x + K y
    for (let i = 0; i < 4; i++) {
      this.state[i] = this.state[i]! + K[i * 2 + 0]! * yx + K[i * 2 + 1]! * yy;
    }
    // P = (I - K H) P
    const newP = new Float64Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const khp = K[i * 2 + 0]! * this.P[0 * 4 + j]! + K[i * 2 + 1]! * this.P[1 * 4 + j]!;
        newP[i * 4 + j] = this.P[i * 4 + j]! - khp;
      }
    }
    this.P = newP;
  }

  current(): Kalman2dState {
    return { x: this.state[0]!, y: this.state[1]!, vx: this.state[2]!, vy: this.state[3]! };
  }
}
