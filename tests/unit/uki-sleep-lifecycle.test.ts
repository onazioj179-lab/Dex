// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { useUkiStore } from '../../src/renderer/store/ukiStore';
import { computeLingerMs, LINGER_MIN_MS, LINGER_MAX_MS } from '../../src/renderer/uki/sleepTiming';

describe('UKI sleep timing (content-aware linger)', () => {
  it('never dwells below the minimum; empty answer sits exactly at it', () => {
    expect(computeLingerMs('')).toBe(LINGER_MIN_MS);
    expect(computeLingerMs('ok')).toBeGreaterThanOrEqual(LINGER_MIN_MS);
    expect(computeLingerMs('a short reply')).toBeLessThan(LINGER_MIN_MS + 2000);
  });

  it('clamps a very long answer to the maximum dwell', () => {
    const long = 'word '.repeat(500);
    expect(computeLingerMs(long)).toBe(LINGER_MAX_MS);
  });

  it('scales between the bounds with answer length', () => {
    const medium = 'word '.repeat(60); // ~18s of reading + base, within bounds
    const ms = computeLingerMs(medium);
    expect(ms).toBeGreaterThan(LINGER_MIN_MS);
    expect(ms).toBeLessThan(LINGER_MAX_MS);
  });
});

describe('UKI sleep lifecycle', () => {
  beforeEach(() => {
    useUkiStore.getState().reset();
  });

  it('sleep() drifts to dormant and hides the transient panel', () => {
    const s = useUkiStore.getState();
    s.setResponse('here is an answer'); // showTranscript -> true, panel content present
    s.sleep();
    const after = useUkiStore.getState();
    expect(after.state).toBe('dormant');
    expect(after.showPanel).toBe(false);
    expect(after.showTranscript).toBe(false);
    expect(after.response).toBe('');
  });

  it('reset() is an awake dismissal — idle, not dormant', () => {
    useUkiStore.getState().setResponse('answer');
    useUkiStore.getState().reset();
    expect(useUkiStore.getState().state).toBe('idle');
  });

  it('openPanel() wakes a dormant UKI back to idle', () => {
    useUkiStore.getState().sleep();
    expect(useUkiStore.getState().state).toBe('dormant');
    useUkiStore.getState().openPanel();
    const after = useUkiStore.getState();
    expect(after.showPanel).toBe(true);
    expect(after.state).toBe('idle');
  });

  it('openPanel() leaves an active (non-dormant) state untouched', () => {
    useUkiStore.getState().setState('listening');
    useUkiStore.getState().openPanel();
    expect(useUkiStore.getState().state).toBe('listening');
  });
});
