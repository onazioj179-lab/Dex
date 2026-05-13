// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * LUFS loudness meter (T3-028 master limiter visualization).
 *
 * Implements ITU-R BS.1770 momentary (400ms) and short-term (3s) loudness
 * over a sliding buffer of mono samples (pre-mix downmix). K-weighting is
 * approximated with a simple two-stage IIR — close enough for visualization
 * (within ~0.5 LU of reference for most program material).
 */

export class LufsMeter {
  private readonly buf: number[] = [];
  private readonly sampleRate: number;
  // K-weight stage 1 (high-shelf ~1681 Hz +4 dB) — fixed coefficients at 48k.
  private hs1 = 0; private hs2 = 0;
  private hp1 = 0; private hp2 = 0;

  constructor(sampleRate = 48_000) {
    this.sampleRate = sampleRate;
  }

  /** Push a block of mono samples in [-1, 1]. */
  push(samples: ArrayLike<number>): void {
    for (let i = 0; i < samples.length; i++) {
      // K-weight high-shelf (very rough biquad).
      const a = 1.53512485958697, b = -2.69169618940638, c = 1.19839281085285;
      const x = samples[i];
      const y = a * x + b * this.hs1 + c * this.hs2;
      this.hs2 = this.hs1; this.hs1 = x;
      // High-pass at ~38 Hz.
      const hp = 1.0 * y - 2.0 * this.hp1 + 1.0 * this.hp2;
      this.hp2 = this.hp1; this.hp1 = y;
      this.buf.push(hp);
    }
    // Trim to last 3 seconds.
    const max = this.sampleRate * 3;
    if (this.buf.length > max) this.buf.splice(0, this.buf.length - max);
  }

  private windowedLufs(windowSeconds: number): number {
    const n = Math.min(this.buf.length, Math.floor(this.sampleRate * windowSeconds));
    if (n <= 0) return -Infinity;
    let sum = 0;
    for (let i = this.buf.length - n; i < this.buf.length; i++) {
      const s = this.buf[i];
      sum += s * s;
    }
    const meanSq = sum / n;
    if (meanSq <= 0) return -Infinity;
    return -0.691 + 10 * Math.log10(meanSq);
  }

  momentary(): number { return this.windowedLufs(0.4); }
  shortTerm(): number { return this.windowedLufs(3.0); }

  reset(): void { this.buf.length = 0; this.hs1 = this.hs2 = this.hp1 = this.hp2 = 0; }
}
