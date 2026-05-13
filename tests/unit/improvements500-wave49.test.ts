// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  OnePoleLowPass,
  OnePoleHighPass,
  springStep,
  criticallyDampedSmooth,
  tukeyWindow,
  easeInQuad,
  easeOutCubic,
  easeOutBack,
  easeOutBounce,
  dbToLinear,
  linearToDb,
  midiToFrequency,
  frequencyToMidi,
  midiToNoteName,
  linearResample,
  quaternionSlerp,
  int16ToFloat32,
  float32ToInt16,
  muLawEncode,
  muLawDecode,
} from '../../src/renderer/improvements500';

describe('improvements500 Wave 49', () => {
  it('OnePoleLowPass smooths a step', () => {
    const lp = new OnePoleLowPass(100, 1000);
    let v = 0;
    for (let i = 0; i < 50; i++) v = lp.process(1);
    expect(v).toBeGreaterThan(0.9);
    expect(v).toBeLessThanOrEqual(1.0001);
  });

  it('OnePoleHighPass attenuates DC', () => {
    const hp = new OnePoleHighPass(100, 1000);
    let v = 0;
    for (let i = 0; i < 200; i++) v = hp.process(1);
    expect(Math.abs(v)).toBeLessThan(0.2);
  });

  it('springStep approaches target', () => {
    let s = { position: 0, velocity: 0 };
    for (let i = 0; i < 200; i++) s = springStep(s, 1, 0.016);
    expect(Math.abs(s.position - 1)).toBeLessThan(0.05);
  });

  it('criticallyDampedSmooth approaches target', () => {
    let s = { position: 0, velocity: 0 };
    for (let i = 0; i < 200; i++) s = criticallyDampedSmooth(s, 1, 0.3, 0.016);
    expect(Math.abs(s.position - 1)).toBeLessThan(0.05);
  });

  it('tukeyWindow shape', () => {
    const w = tukeyWindow(8, 0.5);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[7]).toBeCloseTo(0, 6);
    expect(Math.max(...Array.from(w))).toBeCloseTo(1, 6);
  });

  it('easings monotone in [0,1]', () => {
    expect(easeInQuad(0)).toBe(0);
    expect(easeInQuad(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutBack(1)).toBeCloseTo(1, 6);
    expect(easeOutBounce(1)).toBeCloseTo(1, 6);
  });

  it('decibel conversions roundtrip', () => {
    expect(linearToDb(dbToLinear(-6))).toBeCloseTo(-6, 6);
    expect(dbToLinear(0)).toBeCloseTo(1, 12);
  });

  it('MIDI/frequency roundtrip', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 9);
    expect(frequencyToMidi(440)).toBeCloseTo(69, 9);
    expect(midiToNoteName(60)).toBe('C4');
  });

  it('linearResample preserves endpoints approximately', () => {
    const r = linearResample(new Float32Array([0, 0.5, 1]), 100, 200);
    expect(r.length).toBeGreaterThan(3);
    expect(r[0]!).toBeCloseTo(0, 4);
  });

  it('quaternionSlerp at t=0 returns a, t=1 returns b', () => {
    const a: [number, number, number, number] = [0, 0, 0, 1];
    const b: [number, number, number, number] = [0, 1, 0, 0];
    const q0 = quaternionSlerp(a, b, 0);
    const q1 = quaternionSlerp(a, b, 1);
    expect(q0[3]).toBeCloseTo(1, 9);
    expect(q1[1]).toBeCloseTo(1, 6);
  });

  it('PCM int16/float32 roundtrip', () => {
    const i = new Int16Array([-32768, 0, 32767]);
    const f = int16ToFloat32(i);
    const back = float32ToInt16(f);
    expect(back[0]).toBe(-32768);
    expect(back[2]).toBe(32767);
  });

  it('muLawEncode/Decode roundtrip approximation', () => {
    for (const v of [-0.5, 0, 0.25, 0.9]) {
      const enc = muLawEncode(v);
      const dec = muLawDecode(enc);
      expect(Math.abs(dec - v)).toBeLessThan(0.05);
    }
  });
});
