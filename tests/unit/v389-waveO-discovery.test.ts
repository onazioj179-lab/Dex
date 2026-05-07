// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave O - onboarding tests

import { describe, it, expect } from 'vitest';
import {
  DAILY_TIPS,
  FIRST_RUN_CHECKLIST,
  TRY_CARDS,
  checklistProgress,
  completeChecklistItem,
  currentStep,
  newChecklist,
  newTour,
  nextStep,
  prevStep,
  restartTour,
  searchHelp,
  skipTour,
  startTour,
  tipForDay,
  tourProgress,
  tryCardsByScope,
} from '../../src/shared/onboarding/discovery';

// -------- tour ----------------------------------------------------

const steps = [
  { id: 's1', anchor: 'a', title: 'Step 1', body: '' },
  { id: 's2', anchor: 'b', title: 'Step 2', body: '', required: true },
  { id: 's3', anchor: 'c', title: 'Step 3', body: '' },
];

describe('wave O - tour state machine', () => {
  it('starts idle, becomes running after start', () => {
    const t = startTour(newTour(steps));
    expect(t.status).toBe('running');
    expect(currentStep(t)?.id).toBe('s1');
  });

  it('next advances and completes at end', () => {
    let t = startTour(newTour(steps));
    t = nextStep(t);
    t = nextStep(t);
    expect(currentStep(t)?.id).toBe('s3');
    t = nextStep(t);
    expect(t.status).toBe('complete');
    expect(currentStep(t)).toBeNull();
  });

  it('prev does not go below 0', () => {
    const t = startTour(newTour(steps));
    expect(prevStep(t).index).toBe(0);
  });

  it('skip ignored on required step', () => {
    let t = startTour(newTour(steps));
    t = nextStep(t); // now on required step s2
    t = skipTour(t);
    expect(t.status).toBe('running');
  });

  it('skip works on non-required steps', () => {
    let t = startTour(newTour(steps));
    t = skipTour(t);
    expect(t.status).toBe('skipped');
  });

  it('restart returns to first step', () => {
    let t = startTour(newTour(steps));
    t = nextStep(t);
    t = restartTour(t);
    expect(t.index).toBe(0);
    expect(t.status).toBe('running');
  });

  it('progress reflects index', () => {
    let t = startTour(newTour(steps));
    expect(tourProgress(t)).toBeCloseTo(0);
    t = nextStep(t);
    expect(tourProgress(t)).toBeCloseTo(1 / 3);
  });

  it('empty tour starts complete', () => {
    expect(newTour([]).status).toBe('complete');
  });
});

// -------- try-this cards ------------------------------------------

describe('wave O - try-this cards', () => {
  it('catalogue is non-empty', () => {
    expect(TRY_CARDS.length).toBeGreaterThan(3);
  });

  it('byScope filters by scope', () => {
    const global = tryCardsByScope('global');
    expect(global.length).toBeGreaterThan(0);
    expect(global.every((c) => c.scope === 'global')).toBe(true);
  });
});

// -------- tip-of-the-day -----------------------------------------

describe('wave O - tip of the day', () => {
  it('catalogue is non-empty', () => {
    expect(DAILY_TIPS.length).toBeGreaterThan(3);
  });

  it('same date returns same tip', () => {
    const a = tipForDay('2026-03-15');
    const b = tipForDay('2026-03-15');
    expect(a.id).toBe(b.id);
  });

  it('different dates can return different tips', () => {
    const ids = new Set();
    for (let d = 1; d <= 12; d++) {
      ids.add(tipForDay(`2026-01-${String(d).padStart(2, '0')}`).id);
    }
    expect(ids.size).toBeGreaterThan(1);
  });

  it('throws on empty tips', () => {
    expect(() => tipForDay('2026-01-01', [])).toThrow();
  });
});

// -------- help search --------------------------------------------

const help = [
  { id: 'shortcuts', title: 'Keyboard Shortcuts', keywords: ['shortcut', 'keys', 'hotkey'], category: 'help', action: { kind: 'command' as const, commandId: 'shortcuts' } },
  { id: 'autosave', title: 'Autosave', keywords: ['autosave', 'recover', 'snapshot'], category: 'reliability', action: { kind: 'command' as const, commandId: 'autosave' } },
  { id: 'theme', title: 'Theme settings', keywords: ['theme', 'color', 'dark', 'light'], category: 'appearance', action: { kind: 'command' as const, commandId: 'theme' } },
];

describe('wave O - help search', () => {
  it('empty query returns nothing', () => {
    expect(searchHelp('', help)).toEqual([]);
  });

  it('keyword prefix beats keyword contains', () => {
    const r = searchHelp('short', help);
    expect(r[0].entry.id).toBe('shortcuts');
  });

  it('combo bonus for all-tokens-in-title', () => {
    const r = searchHelp('Theme settings', help);
    expect(r[0].entry.id).toBe('theme');
  });

  it('orders by score desc', () => {
    const r = searchHelp('color theme', help);
    expect(r[0].entry.id).toBe('theme');
  });
});

// -------- checklist ----------------------------------------------

describe('wave O - first-run checklist', () => {
  it('default checklist has expected items', () => {
    expect(FIRST_RUN_CHECKLIST.length).toBeGreaterThan(3);
  });

  it('completes free items immediately', () => {
    const c = completeChecklistItem(newChecklist(), 'sign-in');
    expect(c.completed.has('sign-in')).toBe(true);
  });

  it('blocks dependent items until prerequisite done', () => {
    let c = newChecklist();
    c = completeChecklistItem(c, 'first-note');
    expect(c.completed.has('first-note')).toBe(false);
    c = completeChecklistItem(c, 'sign-in');
    c = completeChecklistItem(c, 'first-note');
    expect(c.completed.has('first-note')).toBe(true);
  });

  it('progress reflects completion ratio', () => {
    let c = newChecklist();
    expect(checklistProgress(c)).toBe(0);
    c = completeChecklistItem(c, 'sign-in');
    c = completeChecklistItem(c, 'theme');
    expect(checklistProgress(c)).toBeCloseTo(2 / FIRST_RUN_CHECKLIST.length);
  });

  it('ignores unknown ids', () => {
    const c = completeChecklistItem(newChecklist(), 'does-not-exist');
    expect(c.completed.size).toBe(0);
  });
});
