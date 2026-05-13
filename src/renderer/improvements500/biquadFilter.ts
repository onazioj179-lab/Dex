// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export function biquadLowpass(sampleRate: number, frequency: number, q: number): BiquadCoefficients {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cosw) / 2) / a0,
    b1: (1 - cosw) / a0,
    b2: ((1 - cosw) / 2) / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  };
}

export function biquadHighpass(sampleRate: number, frequency: number, q: number): BiquadCoefficients {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cosw) / 2) / a0,
    b1: -(1 + cosw) / a0,
    b2: ((1 + cosw) / 2) / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  };
}

export class BiquadFilter {
  private z1 = 0;
  private z2 = 0;
  private c: BiquadCoefficients;

  constructor(coefficients: BiquadCoefficients) {
    this.c = coefficients;
  }

  setCoefficients(c: BiquadCoefficients): void {
    this.c = c;
  }

  process(x: number): number {
    const y = this.c.b0 * x + this.z1;
    this.z1 = this.c.b1 * x - this.c.a1 * y + this.z2;
    this.z2 = this.c.b2 * x - this.c.a2 * y;
    return y;
  }

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }
}
