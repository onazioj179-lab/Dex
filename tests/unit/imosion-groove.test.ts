// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for Imosion's groove quantize (applyGrooveToNotes):
 * offbeat swing shift, downbeat stability, strength blending, velocity
 * accents, purity, and template presence.
 */
import { describe, it, expect } from 'vitest';
import { applyGrooveToNotes, GROOVE_TEMPLATES } from '../../src/renderer/DEXAPPLICATIONS/imosion/ImosionEngine';

const note = (startTime: number, velocity = 100) => ({ startTime, velocity });

describe('applyGrooveToNotes', () => {
  it('leaves downbeats in place and swings offbeats late (shuffle)', () => {
    const out = applyGrooveToNotes([note(0), note(0.5), note(1), note(1.5)], 'shuffle', 100);
    // 8th-grid shuffle: even grid indices (0, 1.0) stay; odd (0.5, 1.5) swing
    expect(out[0].startTime).toBe(0);
    expect(out[2].startTime).toBe(1);
    const shift = 0.5 * (2 * GROOVE_TEMPLATES.shuffle.ratio - 1); // ≈ 0.167
    expect(out[1].startTime).toBeCloseTo(0.5 + shift, 6);
    expect(out[3].startTime).toBeCloseTo(1.5 + shift, 6);
  });

  it('strength blends the shift linearly', () => {
    const full = applyGrooveToNotes([note(0.25)], 'mpc60', 100)[0].startTime;
    const half = applyGrooveToNotes([note(0.25)], 'mpc60', 50)[0].startTime;
    expect(half - 0.25).toBeCloseTo((full - 0.25) / 2, 6);
  });

  it('strength 0 and template "none" are identity on timing', () => {
    const notes = [note(0.25, 90), note(0.5, 80)];
    for (const out of [applyGrooveToNotes(notes, 'mpc60', 0), applyGrooveToNotes(notes, 'none', 100)]) {
      expect(out[0].startTime).toBe(0.25);
      expect(out[1].startTime).toBe(0.5);
      expect(out[0].velocity).toBe(90);
    }
  });

  it('accents downbeats and softens offbeats (mpc60)', () => {
    const out = applyGrooveToNotes([note(0, 100), note(0.25, 100)], 'mpc60', 100);
    expect(out[0].velocity).toBeGreaterThan(100); // downbeat up
    expect(out[1].velocity).toBeLessThan(100);    // offbeat down
  });

  it('reggae accents the OFFBEAT (negative accent)', () => {
    const out = applyGrooveToNotes([note(0, 100), note(0.5, 100)], 'reggae', 100);
    expect(out[0].velocity).toBeLessThan(100);
    expect(out[1].velocity).toBeGreaterThan(100);
  });

  it('tr808 pulls offbeats slightly EARLY (straight ratio, negative push)', () => {
    const out = applyGrooveToNotes([note(0.25)], 'tr808', 100);
    expect(out[0].startTime).toBeLessThan(0.25);
    expect(out[0].startTime).toBeGreaterThan(0.2);
  });

  it('velocity stays within 1..127 and start times never go negative', () => {
    const out = applyGrooveToNotes([note(0.25, 127), note(0.25, 1)], 'sp1200', 100);
    for (const n of out) {
      expect(n.velocity).toBeGreaterThanOrEqual(1);
      expect(n.velocity).toBeLessThanOrEqual(127);
      expect(n.startTime).toBeGreaterThanOrEqual(0);
    }
  });

  it('is pure — input notes are not mutated', () => {
    const src = [note(0.5, 100)];
    applyGrooveToNotes(src, 'shuffle', 100);
    expect(src[0].startTime).toBe(0.5);
    expect(src[0].velocity).toBe(100);
  });

  it('every UI template id (except none) has a definition', () => {
    for (const id of ['mpc60', 'sp1200', 'tr808', 'linnDrum', 'motown', 'reggae', 'shuffle']) {
      expect(GROOVE_TEMPLATES[id]).toBeDefined();
    }
  });
});
