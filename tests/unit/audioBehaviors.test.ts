// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  stepDuck,
  initialDuckStep,
  rms,
  linearToDb,
  dbToLinear,
  DEFAULT_DUCKING,
} from '../../src/shared/audio/audioBehaviors';

describe('audioBehaviors', () => {
  it('rms of silence is 0', () => {
    expect(rms([])).toBe(0);
    expect(rms([0, 0, 0, 0])).toBe(0);
  });

  it('rms of a constant 1.0 signal is 1.0', () => {
    expect(rms([1, 1, 1, 1])).toBeCloseTo(1, 6);
  });

  it('rms of mixed signal is between 0 and 1', () => {
    const v = rms([0.5, -0.5, 0.25, -0.25]);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  it('linearToDb / dbToLinear round-trip', () => {
    expect(linearToDb(1)).toBeCloseTo(0, 6);
    expect(linearToDb(0.5)).toBeCloseTo(-6.02, 1);
    expect(linearToDb(0)).toBe(-Infinity);
    expect(dbToLinear(0)).toBeCloseTo(1, 6);
    expect(dbToLinear(-6)).toBeCloseTo(0.501, 2);
  });

  describe('stepDuck state machine', () => {
    it('starts at rest with full restGain', () => {
      const init = initialDuckStep();
      expect(init.state).toBe('rest');
      expect(init.gain).toBe(DEFAULT_DUCKING.restGain);
    });

    it('moves to ducked after attackFrames of loud voiceover', () => {
      let s = initialDuckStep();
      for (let i = 0; i < DEFAULT_DUCKING.attackFrames; i++) {
        s = stepDuck(s, 0.5);
      }
      expect(s.state).toBe('ducked');
      expect(s.gain).toBe(DEFAULT_DUCKING.duckGain);
    });

    it('returns to attack/rest if voice falls below threshold mid-attack', () => {
      const config = { ...DEFAULT_DUCKING, attackFrames: 4 };
      let s = initialDuckStep(config);
      s = stepDuck(s, 0.5, config);
      s = stepDuck(s, 0.5, config);
      expect(s.state).toBe('attack');
      s = stepDuck(s, 0.0, config);
      expect(s.state).toBe('rest');
      expect(s.gain).toBe(config.restGain);
    });

    it('stays ducked while voiceover stays loud', () => {
      let s = initialDuckStep();
      for (let i = 0; i < 30; i++) s = stepDuck(s, 0.6);
      expect(s.state).toBe('ducked');
      expect(s.gain).toBe(DEFAULT_DUCKING.duckGain);
    });

    it('ramps from duck to rest across releaseFrames after voice quiets', () => {
      const config = { ...DEFAULT_DUCKING, releaseFrames: 4, attackFrames: 1 };
      let s = initialDuckStep(config);
      s = stepDuck(s, 0.5, config); // -> ducked
      expect(s.state).toBe('ducked');
      const gains: number[] = [];
      for (let i = 0; i < config.releaseFrames; i++) {
        s = stepDuck(s, 0.0, config);
        gains.push(s.gain);
      }
      expect(gains[0]).toBeCloseTo(config.duckGain + (config.restGain - config.duckGain) / config.releaseFrames, 3);
      expect(s.state).toBe('rest');
      expect(s.gain).toBe(config.restGain);
    });

    it('re-engages duck if voice comes back during release', () => {
      const config = { ...DEFAULT_DUCKING, releaseFrames: 8, attackFrames: 1 };
      let s = initialDuckStep(config);
      s = stepDuck(s, 0.5, config);
      s = stepDuck(s, 0.0, config);
      expect(s.state).toBe('release');
      s = stepDuck(s, 0.5, config);
      expect(s.state).toBe('ducked');
      expect(s.gain).toBe(config.duckGain);
    });
  });
});
