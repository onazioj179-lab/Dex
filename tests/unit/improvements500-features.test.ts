// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 500-improvement wave feature-module tests.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  cubicBezier, cubicBezierEasing, ease, EASING_PRESETS, interpolateKeyframes,
  applyBrushDynamics, samplePen, isEraserGesture,
  MultiTouchSwipe, swipeToShellAction,
  shingles, jaccard, findDuplicates, applyCollection,
  newComment, extractMentions, lineDiff, diffStats,
  workspaceLayouts, notifications,
} from '../../src/renderer/improvements500';

describe('bezierKeyframes', () => {
  it('cubicBezier hits endpoints exactly', () => {
    expect(cubicBezier(0, [0, 0], [0.5, 1], [1, 0], [1, 1])).toEqual([0, 0]);
    expect(cubicBezier(1, [0, 0], [0.5, 1], [1, 0], [1, 1])).toEqual([1, 1]);
  });

  it('linear easing is identity', () => {
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(Math.abs(ease(x, 'linear') - x)).toBeLessThan(0.01);
    }
  });

  it('easeIn is below linear in the middle', () => {
    expect(ease(0.5, 'easeIn')).toBeLessThan(0.5);
  });

  it('easeOut is above linear in the middle', () => {
    expect(ease(0.5, 'easeOut')).toBeGreaterThan(0.5);
  });

  it('cubicBezierEasing clamps out of range', () => {
    expect(cubicBezierEasing(-1, [0.42, 0], [1, 1])).toBe(0);
    expect(cubicBezierEasing(2, [0.42, 0], [1, 1])).toBe(1);
  });

  it('every preset returns a finite number', () => {
    for (const name of Object.keys(EASING_PRESETS) as Array<keyof typeof EASING_PRESETS>) {
      expect(Number.isFinite(ease(0.3, name))).toBe(true);
    }
  });

  it('interpolateKeyframes returns endpoint at boundary', () => {
    expect(interpolateKeyframes({ t: 0, v: 0 }, { t: 1, v: 100 }, 0)).toBe(0);
    expect(interpolateKeyframes({ t: 0, v: 0 }, { t: 1, v: 100 }, 1)).toBe(100);
  });

  it('interpolateKeyframes mid-point sits between values', () => {
    const v = interpolateKeyframes({ t: 0, v: 0 }, { t: 1, v: 100 }, 0.5);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(100);
  });
});

describe('penInput', () => {
  function fakePtr(over: Partial<PointerEvent>): PointerEvent {
    return {
      clientX: 10, clientY: 20, pressure: 0.5, tiltX: 10, tiltY: -5,
      pointerType: 'pen', buttons: 0, button: 0, twist: 0, width: 1, height: 1,
      timeStamp: 1234, ...over,
    } as unknown as PointerEvent;
  }

  it('samplePen carries pressure + tilt', () => {
    const s = samplePen(fakePtr({ pressure: 0.8 }));
    expect(s.pressure).toBe(0.8);
    expect(s.tiltX).toBe(10);
  });

  it('palm rejection flags large touch contact', () => {
    const s = samplePen(fakePtr({ pointerType: 'touch', width: 50, height: 50 }));
    expect(s.isPalm).toBe(true);
  });

  it('barrelButton triggers eraser gesture', () => {
    const s = samplePen(fakePtr({ buttons: 2 }));
    expect(isEraserGesture(s)).toBe(true);
  });

  it('applyBrushDynamics scales size by pressure', () => {
    const s = samplePen(fakePtr({ pressure: 1 }));
    const out = applyBrushDynamics(s, { baseSize: 10, baseOpacity: 1 });
    expect(out.size).toBeCloseTo(10);
    const s2 = samplePen(fakePtr({ pressure: 0 }));
    const out2 = applyBrushDynamics(s2, { baseSize: 10, baseOpacity: 1 });
    expect(out2.size).toBeCloseTo(0);
  });

  it('applyBrushDynamics tilt-angle uses arctan', () => {
    const s = samplePen(fakePtr({ tiltX: 1, tiltY: 1 }));
    const out = applyBrushDynamics(s, { baseSize: 1, baseOpacity: 1, tiltAngle: true });
    expect(out.angle).toBeCloseTo(Math.PI / 4);
  });
});

describe('multiTouchSwipe', () => {
  function ev(id: number, x: number, y: number): PointerEvent {
    return { pointerId: id, clientX: x, clientY: y, pointerType: 'touch' } as unknown as PointerEvent;
  }

  it('returns null until the last finger lifts', () => {
    const m = new MultiTouchSwipe();
    m.onPointerDown(ev(1, 0, 0));
    m.onPointerDown(ev(2, 50, 0));
    m.onPointerMove(ev(2, 50, 200));
    expect(m.onPointerUp(ev(1, 0, 0))).toBeNull();
    const r = m.onPointerUp(ev(2, 50, 200));
    expect(r?.fingers).toBe(2);
    expect(r?.dir).toBe('down');
  });

  it('rejects swipes shorter than the threshold', () => {
    const m = new MultiTouchSwipe();
    m.onPointerDown(ev(1, 0, 0));
    m.onPointerMove(ev(1, 5, 5));
    expect(m.onPointerUp(ev(1, 5, 5))?.dir).toBeNull();
  });

  it('swipeToShellAction maps 2-finger down to minimize', () => {
    expect(swipeToShellAction({ fingers: 2, dir: 'down', distance: 100 })).toBe('window.minimize');
    expect(swipeToShellAction({ fingers: 2, dir: 'up', distance: 100 })).toBe('window.maximize');
    expect(swipeToShellAction({ fingers: 4, dir: 'up', distance: 200 })).toBe('shell.overview');
    expect(swipeToShellAction({ fingers: 1, dir: 'left', distance: 200 })).toBeNull();
  });
});

describe('smartCollections', () => {
  const items = [
    { id: '1', source: 'app-catalog', title: 'Imosion DAW', body: 'audio mixing tracks plugin sample edit', ts: 1 },
    { id: '2', source: 'app-catalog', title: 'PRISM brush', body: 'paint canvas brush layers stroke composite', ts: 2 },
    { id: '3', source: 'recent-files', title: 'note.txt', body: 'audio mixing tracks plugin sample edit', ts: 3 },
  ];

  it('shingles produces n-grams', () => {
    expect(shingles('the quick brown fox', 2).has('the quick')).toBe(true);
  });

  it('jaccard symmetric and bounded', () => {
    const a = shingles('hello world');
    const b = shingles('hello world');
    expect(jaccard(a, b)).toBe(1);
    const c = shingles('completely different content here');
    expect(jaccard(a, c)).toBeLessThan(0.2);
  });

  it('findDuplicates clusters near-identical items', () => {
    const groups = findDuplicates(items, 0.8);
    expect(groups.length).toBe(1);
    expect(groups[0].duplicates.length).toBe(1);
  });

  it('applyCollection filters by AND-ed rules', () => {
    const out = applyCollection(items, {
      id: 'c1', name: 'apps with audio',
      rules: [
        { field: 'source', op: 'eq', value: 'app-catalog' },
        { field: 'body', op: 'contains', value: 'audio' },
      ],
    });
    expect(out.map((i) => i.id)).toEqual(['1']);
  });
});

describe('collabComments', () => {
  it('extractMentions picks @handles', () => {
    expect(extractMentions('hi @ada and @grace')).toEqual(['ada', 'grace']);
  });

  it('newComment populates id, ts, mentions', () => {
    const c = newComment('t1', { userId: 'u', displayName: 'U' }, 'cc @sam');
    expect(c.threadId).toBe('t1');
    expect(c.mentions).toEqual(['sam']);
    expect(c.id.startsWith('c_')).toBe(true);
  });

  it('lineDiff produces add/del/keep ops', () => {
    const ops = lineDiff('a\nb\nc', 'a\nx\nc');
    const stats = diffStats(ops);
    expect(stats.kept).toBe(2);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
  });
});

describe('workspaceLayouts', () => {
  beforeEach(() => { workspaceLayouts._clearAll(); });

  it('saveLayout stores and getLayout retrieves', () => {
    const l = workspaceLayouts.saveLayout('split', [
      { appId: 'notes', x: 0, y: 0, width: 800, height: 600, z: 1, state: 'normal' },
    ]);
    expect(workspaceLayouts.getLayout(l.id)?.name).toBe('split');
  });

  it('listLayouts filters by workspace', () => {
    workspaceLayouts.saveLayout('a', [], { workspace: 'work' });
    workspaceLayouts.saveLayout('b', [], { workspace: 'home' });
    expect(workspaceLayouts.listLayouts('work').length).toBe(1);
  });

  it('deleteLayout removes', () => {
    const l = workspaceLayouts.saveLayout('temp', []);
    expect(workspaceLayouts.deleteLayout(l.id)).toBe(true);
    expect(workspaceLayouts.getLayout(l.id)).toBeUndefined();
  });
});

describe('notifications', () => {
  beforeEach(() => { notifications._resetPrefs(); });

  it('shouldDeliver true by default', () => {
    expect(notifications.shouldDeliver('files')).toBe(true);
  });

  it('dnd blocks delivery', () => {
    notifications.setDnd(true);
    expect(notifications.shouldDeliver('files')).toBe(false);
  });

  it('per-app mute blocks only that app', () => {
    notifications.setAppMuted('files', true);
    expect(notifications.shouldDeliver('files')).toBe(false);
    expect(notifications.shouldDeliver('notes')).toBe(true);
  });

  it('snooze blocks until expiry', () => {
    notifications.snoozeApp('files', 60_000);
    expect(notifications.shouldDeliver('files', new Date())).toBe(false);
    expect(notifications.shouldDeliver('files', new Date(Date.now() + 120_000))).toBe(true);
  });

  it('quiet hours blocks during window', () => {
    notifications.setQuietHours({ enabled: true, startHour: 22, endHour: 7, weekdays: [] });
    const night = new Date(); night.setHours(23);
    expect(notifications.shouldDeliver('files', night)).toBe(false);
    const day = new Date(); day.setHours(12);
    expect(notifications.shouldDeliver('files', day)).toBe(true);
  });

  it('groupByApp aggregates lists', () => {
    const grouped = notifications.groupByApp([
      { appId: 'a', text: '1' }, { appId: 'b', text: '2' }, { appId: 'a', text: '3' },
    ]);
    expect(grouped.get('a')?.length).toBe(2);
    expect(grouped.get('b')?.length).toBe(1);
  });
});
