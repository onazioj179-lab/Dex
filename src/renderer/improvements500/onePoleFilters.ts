// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * One-pole low-pass and high-pass filters for streaming numeric signals.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export class OnePoleLowPass {
  private alpha: number;
  private last = 0;
  private initialized = false;

  constructor(cutoffHz: number, sampleRate: number) {
    if (sampleRate <= 0) throw new RangeError('OnePoleLowPass: sampleRate must be positive');
    const dt = 1 / sampleRate;
    const rc = 1 / (2 * Math.PI * cutoffHz);
    this.alpha = dt / (rc + dt);
  }

  process(sample: number): number {
    if (!this.initialized) {
      this.last = sample;
      this.initialized = true;
      return sample;
    }
    this.last = this.last + this.alpha * (sample - this.last);
    return this.last;
  }
}

export class OnePoleHighPass {
  private alpha: number;
  private lastIn = 0;
  private lastOut = 0;
  private initialized = false;

  constructor(cutoffHz: number, sampleRate: number) {
    if (sampleRate <= 0) throw new RangeError('OnePoleHighPass: sampleRate must be positive');
    const dt = 1 / sampleRate;
    const rc = 1 / (2 * Math.PI * cutoffHz);
    this.alpha = rc / (rc + dt);
  }

  process(sample: number): number {
    if (!this.initialized) {
      this.lastIn = sample;
      this.initialized = true;
      return 0;
    }
    this.lastOut = this.alpha * (this.lastOut + sample - this.lastIn);
    this.lastIn = sample;
    return this.lastOut;
  }
}
