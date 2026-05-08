// =============================================================================
// DEX Platform — Track D2: privacy-preserving telemetry
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Local aggregator for opt-in metrics. Adds Laplace noise scaled to the
 * sensitivity of each counter so individual events cannot be recovered
 * from aggregates. Values are bucketed and emitted in fixed-cadence
 * batches; nothing leaves the device unless explicitly enabled.
 */

export type TelemetryCategory = 'perf' | 'crash' | 'feature' | 'store';

export interface TelemetryConsent {
  perf: boolean;
  crash: boolean;
  feature: boolean;
  store: boolean;
}

export const TELEMETRY_OFF: TelemetryConsent = { perf: false, crash: false, feature: false, store: false };

export interface CounterBucket {
  category: TelemetryCategory;
  name: string;
  /** Privacy budget epsilon — smaller = more noise. */
  epsilon: number;
  /** Raw count this batch. */
  count: number;
}

export interface NoiseSource {
  /** Returns uniform [0,1). */
  unit(): number;
}

export class FixedNoiseSource implements NoiseSource {
  private i = 0;
  constructor(private readonly samples: number[]) {}
  unit(): number {
    const v = this.samples[this.i % this.samples.length]!;
    this.i += 1;
    return v;
  }
}

/** Laplace inverse-CDF sampler. */
export function laplaceSample(mu: number, scale: number, n: NoiseSource): number {
  const u = n.unit() - 0.5;
  const sign = u < 0 ? -1 : 1;
  return mu - scale * sign * Math.log(1 - 2 * Math.abs(u));
}

export function privatize(b: CounterBucket, n: NoiseSource): number {
  if (b.epsilon <= 0) return Math.round(b.count);
  const scale = 1 / b.epsilon;
  const noisy = b.count + laplaceSample(0, scale, n);
  return Math.max(0, Math.round(noisy));
}

export interface BatchInput {
  consent: TelemetryConsent;
  buckets: CounterBucket[];
  now: number;
}

export interface OutboundBatch {
  takenAt: number;
  records: { category: TelemetryCategory; name: string; value: number }[];
}

export function buildBatch(input: BatchInput, n: NoiseSource): OutboundBatch | null {
  const allowed = input.buckets.filter(b => input.consent[b.category]);
  if (allowed.length === 0) return null;
  return {
    takenAt: input.now,
    records: allowed.map(b => ({ category: b.category, name: b.name, value: privatize(b, n) })),
  };
}
