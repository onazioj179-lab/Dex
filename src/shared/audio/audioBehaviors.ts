// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// audioBehaviors
//
// Pure helpers powering the "Behaviors" feedback request: in audio / video
// editing flows, a music track should automatically duck under a voiceover
// track when the voiceover is active. Inputs are RMS levels (0..1) over a
// short window; outputs are gain multipliers in linear space.
//
// Also includes a hysteresis-aware state machine so we don't pump the gain
// up and down on every micro-pause in the voiceover.
// =============================================================================

export interface DuckingConfig {
  /** Threshold above which voiceover is considered "active". 0..1. */
  activationThreshold: number;
  /** Linear gain to apply to the music track while ducking. 0..1. */
  duckGain: number;
  /** Linear gain to apply at rest. 0..1. */
  restGain: number;
  /** Min frames the voice must be below threshold before releasing. */
  releaseFrames: number;
  /** Min frames the voice must be above threshold before engaging. */
  attackFrames: number;
}

export const DEFAULT_DUCKING: DuckingConfig = {
  activationThreshold: 0.04,
  duckGain: 0.25,
  restGain: 1.0,
  releaseFrames: 12,
  attackFrames: 2,
};

export type DuckState = 'rest' | 'attack' | 'ducked' | 'release';

export interface DuckStep {
  state: DuckState;
  /** Linear gain to apply to the music bed for this frame. */
  gain: number;
  /** Counter held by the state machine; pass back into the next call. */
  framesInState: number;
}

/**
 * Advance the ducking state machine by one frame given the current voiceover
 * RMS level. Pure: caller threads the previous step back in.
 */
export function stepDuck(
  prev: DuckStep,
  voiceRms: number,
  config: DuckingConfig = DEFAULT_DUCKING
): DuckStep {
  const above = voiceRms >= config.activationThreshold;
  switch (prev.state) {
    case 'rest':
      if (above) {
        return prev.framesInState + 1 >= config.attackFrames
          ? { state: 'ducked', gain: config.duckGain, framesInState: 0 }
          : { state: 'attack', gain: prev.gain, framesInState: prev.framesInState + 1 };
      }
      return { state: 'rest', gain: config.restGain, framesInState: 0 };
    case 'attack':
      if (above) {
        if (prev.framesInState + 1 >= config.attackFrames) {
          return { state: 'ducked', gain: config.duckGain, framesInState: 0 };
        }
        return { state: 'attack', gain: prev.gain, framesInState: prev.framesInState + 1 };
      }
      return { state: 'rest', gain: config.restGain, framesInState: 0 };
    case 'ducked':
      if (!above) {
        // Begin ramping immediately on the first silent frame so the music
        // visibly lifts on frame 1 rather than holding flat at duckGain.
        const t = 1 / config.releaseFrames;
        const gain = config.duckGain + (config.restGain - config.duckGain) * t;
        return { state: 'release', gain, framesInState: 1 };
      }
      return { state: 'ducked', gain: config.duckGain, framesInState: 0 };
    case 'release':
      if (above) {
        return { state: 'ducked', gain: config.duckGain, framesInState: 0 };
      }
      if (prev.framesInState + 1 >= config.releaseFrames) {
        return { state: 'rest', gain: config.restGain, framesInState: 0 };
      }
      // Linearly ramp the gain from duckGain back to restGain over the release.
      const t = (prev.framesInState + 1) / config.releaseFrames;
      const gain = config.duckGain + (config.restGain - config.duckGain) * t;
      return { state: 'release', gain, framesInState: prev.framesInState + 1 };
  }
}

/** Initial state for stepDuck. */
export function initialDuckStep(config: DuckingConfig = DEFAULT_DUCKING): DuckStep {
  return { state: 'rest', gain: config.restGain, framesInState: 0 };
}

/**
 * Compute RMS of a sample frame. Inputs are -1..1 floats; output is 0..1.
 */
export function rms(samples: ArrayLike<number>): number {
  if (!samples || samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples.length);
}

/** Convert linear gain (0..1) to dBFS (negative for attenuation). */
export function linearToDb(gain: number): number {
  if (gain <= 0) return -Infinity;
  return 20 * Math.log10(gain);
}

/** Convert dBFS to linear gain. */
export function dbToLinear(db: number): number {
  if (!Number.isFinite(db)) return db < 0 ? 0 : 1;
  return Math.pow(10, db / 20);
}
