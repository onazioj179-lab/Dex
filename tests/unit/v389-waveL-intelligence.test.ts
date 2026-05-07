// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave L - intelligence tests

import { describe, it, expect } from 'vitest';
import {
  CALIBRATION_CAPACITY,
  PATTERN_DECAY_MS,
  UNDO_LOG_CAPACITY,
  armScore,
  brierScore,
  calibrationBias,
  decayPatterns,
  diffPlans,
  newBandit,
  newCalibration,
  newUndoLog,
  popUndo,
  pushUndo,
  recentUndos,
  recordCalibration,
  recordOutcome,
  recordPattern,
  selectArm,
  suggestSkills,
} from '../../src/shared/uki/intelligence';

// -------- calibration ----------------------------------------------

describe('wave L - calibration', () => {
  it('default capacity is 200', () => {
    expect(CALIBRATION_CAPACITY).toBe(200);
  });

  it('returns null brier with <5 samples', () => {
    const c = recordCalibration(newCalibration(), { predicted: 0.8, correct: true });
    expect(brierScore(c)).toBeNull();
  });

  it('perfect calibration → low brier', () => {
    let c = newCalibration();
    for (let i = 0; i < 10; i++) c = recordCalibration(c, { predicted: 1, correct: true });
    expect(brierScore(c)).toBe(0);
  });

  it('worst calibration → brier 1', () => {
    let c = newCalibration();
    for (let i = 0; i < 10; i++) c = recordCalibration(c, { predicted: 1, correct: false });
    expect(brierScore(c)).toBe(1);
  });

  it('over-confidence yields negative bias', () => {
    let c = newCalibration();
    for (let i = 0; i < 10; i++) c = recordCalibration(c, { predicted: 0.9, correct: i < 5 });
    // pred mean 0.9, obs mean 0.5 → bias = -0.4 clamped to -0.3
    expect(calibrationBias(c)).toBe(-0.3);
  });

  it('under-confidence yields positive bias', () => {
    let c = newCalibration();
    for (let i = 0; i < 10; i++) c = recordCalibration(c, { predicted: 0.4, correct: true });
    // bias 1 - 0.4 = 0.6 clamped to 0.3
    expect(calibrationBias(c)).toBe(0.3);
  });

  it('rolling capacity drops oldest samples', () => {
    let c = newCalibration(5);
    for (let i = 0; i < 8; i++) c = recordCalibration(c, { predicted: 0.5, correct: true });
    expect(c.samples).toHaveLength(5);
  });
});

// -------- plan diff ------------------------------------------------

describe('wave L - plan diff', () => {
  const step = (id: string, reversible = true) => ({
    id, action: 'a', label: id, reversible, affects: [],
  });

  it('detects added/removed', () => {
    const d = diffPlans([step('a'), step('b')], [step('b'), step('c')]);
    expect(d.added.map((s) => s.id)).toEqual(['c']);
    expect(d.removed.map((s) => s.id)).toEqual(['a']);
  });

  it('detects reordered ids', () => {
    const d = diffPlans([step('a'), step('b'), step('c')], [step('c'), step('a'), step('b')]);
    expect(d.reordered).toEqual([
      { id: 'c', from: 2, to: 0 },
      { id: 'a', from: 0, to: 1 },
      { id: 'b', from: 1, to: 2 },
    ]);
  });

  it('flags destructive plans', () => {
    const d = diffPlans([], [step('a', false)]);
    expect(d.hasDestructive).toBe(true);
  });

  it('reversible-only plan is not destructive', () => {
    const d = diffPlans([], [step('a', true), step('b', true)]);
    expect(d.hasDestructive).toBe(false);
  });
});

// -------- skill suggestions ----------------------------------------

describe('wave L - skill suggestions', () => {
  const matchers = [
    { skillId: 'notes.summarise', keywords: ['summarise', 'summary'], baseScore: 50 },
    { skillId: 'code.explain', keywords: ['function', 'class', 'method'], baseScore: 60 },
    { skillId: 'translate.fr', keywords: ['translate'], regex: /\bfr\b/i, baseScore: 70 },
  ];

  it('returns empty for empty selection', () => {
    expect(suggestSkills('', matchers)).toEqual([]);
  });

  it('matches keyword case-insensitively', () => {
    const r = suggestSkills('Please summarise this', matchers);
    expect(r[0].skillId).toBe('notes.summarise');
    expect(r[0].matched).toContain('summarise');
  });

  it('regex requirement gates matches', () => {
    expect(suggestSkills('translate this', matchers).find((s) => s.skillId === 'translate.fr')).toBeUndefined();
    expect(suggestSkills('translate to fr please', matchers).find((s) => s.skillId === 'translate.fr')).toBeDefined();
  });

  it('orders by score desc', () => {
    const r = suggestSkills('explain this function class method', matchers);
    expect(r[0].skillId).toBe('code.explain');
    expect(r[0].score).toBe(60 + 30);
  });
});

// -------- undo log -------------------------------------------------

describe('wave L - undo log', () => {
  it('default capacity is 100', () => {
    expect(UNDO_LOG_CAPACITY).toBe(100);
  });

  it('pop returns last and shrinks log', () => {
    let log = newUndoLog();
    log = pushUndo(log, { id: '1', recordedAt: 0, label: 'a', payload: null });
    log = pushUndo(log, { id: '2', recordedAt: 1, label: 'b', payload: null });
    const r = popUndo(log);
    expect(r.entry?.id).toBe('2');
    expect(r.log.entries).toHaveLength(1);
  });

  it('pop on empty returns null', () => {
    const r = popUndo(newUndoLog());
    expect(r.entry).toBeNull();
  });

  it('capacity trims oldest', () => {
    let log = newUndoLog(2);
    log = pushUndo(log, { id: '1', recordedAt: 0, label: 'a', payload: null });
    log = pushUndo(log, { id: '2', recordedAt: 0, label: 'b', payload: null });
    log = pushUndo(log, { id: '3', recordedAt: 0, label: 'c', payload: null });
    expect(log.entries.map((e) => e.id)).toEqual(['2', '3']);
  });

  it('recentUndos returns newest first', () => {
    let log = newUndoLog();
    log = pushUndo(log, { id: '1', recordedAt: 0, label: 'a', payload: null });
    log = pushUndo(log, { id: '2', recordedAt: 0, label: 'b', payload: null });
    expect(recentUndos(log, 2).map((e) => e.id)).toEqual(['2', '1']);
  });
});

// -------- pattern decay --------------------------------------------

describe('wave L - pattern decay', () => {
  it('default decay is 30 days', () => {
    expect(PATTERN_DECAY_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('drops stale patterns', () => {
    const now = 1_000_000_000;
    const r = decayPatterns([
      { patternId: 'fresh', lastSeenAt: now - 1_000, count: 1 },
      { patternId: 'old', lastSeenAt: now - PATTERN_DECAY_MS - 1, count: 1 },
    ], now);
    expect(r.map((p) => p.patternId)).toEqual(['fresh']);
  });

  it('record creates and increments', () => {
    let p: ReturnType<typeof recordPattern> = [];
    p = recordPattern(p, 'a', 0);
    p = recordPattern(p, 'a', 5);
    p = recordPattern(p, 'b', 10);
    const a = p.find((x) => x.patternId === 'a')!;
    expect(a.count).toBe(2);
    expect(a.lastSeenAt).toBe(5);
    expect(p).toHaveLength(2);
  });
});

// -------- bandit ---------------------------------------------------

describe('wave L - bandit', () => {
  it('new arm score is 0.5 (optimistic)', () => {
    expect(armScore(undefined)).toBe(0.5);
  });

  it('records trials and rewards', () => {
    let s = newBandit();
    s = recordOutcome(s, 'x', true);
    s = recordOutcome(s, 'x', true);
    s = recordOutcome(s, 'x', false);
    expect(s.arms['x'].trials).toBe(3);
    expect(s.arms['x'].rewards).toBe(2);
    expect(armScore(s.arms['x'])).toBeCloseTo(2 / 3);
  });

  it('exploits best arm when random > epsilon', () => {
    let s = newBandit(0.1);
    s = recordOutcome(s, 'a', true);
    s = recordOutcome(s, 'a', true);
    s = recordOutcome(s, 'b', false);
    s = recordOutcome(s, 'b', false);
    // random=0.9 → exploit
    expect(selectArm(s, ['a', 'b'], () => 0.9)).toBe('a');
  });

  it('explores when random < epsilon', () => {
    const s = newBandit(0.5);
    // random=0.1 (<epsilon) → explore. Second call picks index = floor(0.1*2)=0
    expect(selectArm(s, ['a', 'b'], () => 0.1)).toBe('a');
  });

  it('returns null on empty candidates', () => {
    expect(selectArm(newBandit(), [])).toBeNull();
  });
});
