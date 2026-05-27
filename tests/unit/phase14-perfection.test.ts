// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  VectorMemoryStore, cosine,
  WorkflowPredictor,
  NotificationStack,
  layoutDock,
  selectBlurTier,
  DragSession,
  HoverIntent,
  PluginOverloadGuard,
  AutosaveCoordinator,
} from '../../src/shared/phase14/perfectionKit';

describe('Phase 14 - cosine + VectorMemoryStore', () => {
  it('cosine basic', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });

  it('rejects dim mismatch', () => {
    expect(() => cosine([1, 0], [1])).toThrow();
  });

  it('add/query returns top-k by score with id tiebreak', () => {
    const s = new VectorMemoryStore({ dimension: 2 });
    s.add({ id: 'a', vector: [1, 0], storedAt: 1 });
    s.add({ id: 'b', vector: [0.9, 0.1], storedAt: 2 });
    s.add({ id: 'c', vector: [0, 1], storedAt: 3 });
    const r = s.query([1, 0], 2);
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r[0]!.score).toBeGreaterThan(r[1]!.score);
  });

  it('rejects bad inputs', () => {
    expect(() => new VectorMemoryStore({ dimension: 0 })).toThrow();
    const s = new VectorMemoryStore({ dimension: 2 });
    expect(() => s.add({ id: '', vector: [1, 0], storedAt: 1 })).toThrow();
    expect(() => s.add({ id: 'x', vector: [1, 0, 0], storedAt: 1 })).toThrow();
    s.add({ id: 'x', vector: [1, 0], storedAt: 1 });
    expect(() => s.add({ id: 'x', vector: [0, 1], storedAt: 2 })).toThrow();
    expect(() => s.query([1], 1)).toThrow();
    expect(() => s.query([1, 0], 0)).toThrow();
  });

  it('evicts oldest at maxEntries', () => {
    const s = new VectorMemoryStore({ dimension: 2, maxEntries: 2 });
    s.add({ id: 'a', vector: [1, 0], storedAt: 1 });
    s.add({ id: 'b', vector: [0, 1], storedAt: 2 });
    s.add({ id: 'c', vector: [1, 1], storedAt: 3 });
    expect(s.size()).toBe(2);
  });
});

describe('Phase 14 - WorkflowPredictor', () => {
  it('predicts based on observed transitions', () => {
    const w = new WorkflowPredictor();
    w.observe('open-editor', 'save');
    w.observe('open-editor', 'save');
    w.observe('open-editor', 'close');
    const r = w.predict('open-editor');
    expect(r[0]!.next).toBe('save');
    expect(r[0]!.probability).toBeCloseTo(2 / 3);
    expect(r[1]!.next).toBe('close');
  });

  it('returns empty for unknown prev', () => {
    expect(new WorkflowPredictor().predict('nope')).toEqual([]);
  });

  it('reset clears state', () => {
    const w = new WorkflowPredictor();
    w.observe('a', 'b');
    w.reset();
    expect(w.predict('a')).toEqual([]);
  });

  it('rejects bad inputs', () => {
    const w = new WorkflowPredictor();
    expect(() => w.observe('', 'x')).toThrow();
    expect(() => w.predict('a', 0)).toThrow();
  });
});

describe('Phase 14 - NotificationStack', () => {
  it('orders by priority then recency, capped to maxVisible', () => {
    const s = new NotificationStack({ maxVisible: 2 });
    s.push({ id: '1', priority: 'low', title: 'A', createdAt: 1 });
    s.push({ id: '2', priority: 'urgent', title: 'B', createdAt: 2 });
    s.push({ id: '3', priority: 'high', title: 'C', createdAt: 3 });
    const v = s.visible(10);
    expect(v.map((n) => n.id)).toEqual(['2', '3']);
  });

  it('drops expired in visible() and pruneExpired removes them', () => {
    const s = new NotificationStack();
    s.push({ id: 'a', priority: 'normal', title: 'x', createdAt: 0, ttlMs: 100 });
    s.push({ id: 'b', priority: 'normal', title: 'y', createdAt: 0 });
    expect(s.visible(50).length).toBe(2);
    expect(s.visible(200).length).toBe(1);
    expect(s.pruneExpired(200)).toBe(1);
    expect(s.count()).toBe(1);
  });

  it('rejects bad inputs', () => {
    const s = new NotificationStack();
    expect(() => s.push({ id: '', priority: 'low', title: 't', createdAt: 0 })).toThrow();
    expect(() => s.push({ id: 'x', priority: 'low', title: '', createdAt: 0 })).toThrow();
  });

  it('clear removes everything', () => {
    const s = new NotificationStack();
    s.push({ id: 'a', priority: 'low', title: 't', createdAt: 0 });
    s.clear();
    expect(s.count()).toBe(0);
  });
});

describe('Phase 14 - layoutDock', () => {
  it('places pinned first, then running-only', () => {
    const slots = layoutDock(
      [
        { id: 'a', pinned: true },
        { id: 'b', running: true },
        { id: 'c', pinned: true },
        { id: 'd' },
      ],
      { iconSize: 40, gap: 8, viewportWidth: 1000 },
    );
    expect(slots.map((s) => s.id)).toEqual(['a', 'c', 'b']);
    expect(slots[1]!.x - slots[0]!.x).toBe(48);
  });

  it('returns [] for empty', () => {
    expect(layoutDock([], { iconSize: 40, gap: 8, viewportWidth: 800 })).toEqual([]);
  });

  it('rejects bad geometry', () => {
    expect(() => layoutDock([], { iconSize: 0, gap: 8, viewportWidth: 800 })).toThrow();
    expect(() => layoutDock([], { iconSize: 40, gap: -1, viewportWidth: 800 })).toThrow();
    expect(() => layoutDock([], { iconSize: 40, gap: 8, viewportWidth: 0 })).toThrow();
  });
});

describe('Phase 14 - selectBlurTier', () => {
  it('off when user prefers off', () => {
    expect(selectBlurTier({ gpuPressure: 'low', userPreference: 'off' }).tier).toBe('off');
  });

  it('eco under battery saver or thermal throttle', () => {
    expect(selectBlurTier({ gpuPressure: 'low', batterySaver: true }).tier).toBe('eco');
    expect(selectBlurTier({ gpuPressure: 'low', thermalThrottling: true }).tier).toBe('eco');
  });

  it('downgrades on gpu pressure', () => {
    expect(selectBlurTier({ gpuPressure: 'critical' }).tier).toBe('off');
    expect(selectBlurTier({ gpuPressure: 'high' }).tier).toBe('eco');
    expect(selectBlurTier({ gpuPressure: 'medium' }).tier).toBe('standard');
    expect(selectBlurTier({ gpuPressure: 'low' }).tier).toBe('high');
  });
});

describe('Phase 14 - DragSession', () => {
  it('start/drop returns target + payload', () => {
    const d = new DragSession();
    d.start('item1', { kind: 'file', data: { path: '/a' } }, 1);
    expect(d.isActive()).toBe(true);
    const r = d.drop('zone-A');
    expect(r).toEqual({ id: 'item1', targetId: 'zone-A', payload: { kind: 'file', data: { path: '/a' } } });
    expect(d.isActive()).toBe(false);
  });

  it('cancel ends session', () => {
    const d = new DragSession();
    d.start('x', { kind: 'k', data: {} });
    expect(d.cancel()).toBe(true);
    expect(d.cancel()).toBe(false);
  });

  it('rejects double start and bad inputs', () => {
    const d = new DragSession();
    d.start('x', { kind: 'k', data: {} });
    expect(() => d.start('y', { kind: 'k', data: {} })).toThrow();
    d.cancel();
    expect(() => d.start('', { kind: 'k', data: {} })).toThrow();
    expect(() => d.start('z', { kind: '', data: {} })).toThrow();
  });

  it('drop with no active session returns null', () => {
    expect(new DragSession().drop('x')).toBeNull();
  });
});

describe('Phase 14 - HoverIntent', () => {
  it('opens after open delay', () => {
    const h = new HoverIntent({ openDelayMs: 100, closeGraceMs: 100 });
    h.enter(0);
    expect(h.tick(50)).toBe('closed');
    expect(h.tick(120)).toBe('open');
  });

  it('stays open during close grace, then closes', () => {
    const h = new HoverIntent({ openDelayMs: 0, closeGraceMs: 100 });
    h.enter(0);
    h.tick(0);
    h.leave(0);
    expect(h.tick(50)).toBe('open');
    expect(h.tick(150)).toBe('closed');
  });

  it('re-enter while pending-close cancels close', () => {
    const h = new HoverIntent({ openDelayMs: 0, closeGraceMs: 100 });
    h.enter(0); h.tick(0);
    h.leave(10);
    h.enter(20);
    expect(h.tick(200)).toBe('open');
  });

  it('reset returns to closed', () => {
    const h = new HoverIntent({ openDelayMs: 0, closeGraceMs: 0 });
    h.enter(0); h.tick(0);
    h.reset();
    expect(h.tick(0)).toBe('closed');
  });

  it('rejects negative delays', () => {
    expect(() => new HoverIntent({ openDelayMs: -1, closeGraceMs: 0 })).toThrow();
  });
});

describe('Phase 14 - PluginOverloadGuard', () => {
  it('throttles after exceeding error budget', () => {
    const g = new PluginOverloadGuard({ maxErrorsPerWindow: 3, windowMs: 1000, cooldownMs: 5000 });
    g.reportError('p', 0);
    g.reportError('p', 100);
    const r = g.reportError('p', 200);
    expect(r.throttled).toBe(true);
    expect(g.isThrottled('p', 1000)).toBe(true);
    expect(g.isThrottled('p', 6000)).toBe(false);
  });

  it('errors outside window do not count', () => {
    const g = new PluginOverloadGuard({ maxErrorsPerWindow: 2, windowMs: 100, cooldownMs: 1000 });
    g.reportError('p', 0);
    const r = g.reportError('p', 200);
    expect(r.throttled).toBe(false);
  });

  it('reset clears state', () => {
    const g = new PluginOverloadGuard({ maxErrorsPerWindow: 1, windowMs: 100, cooldownMs: 100 });
    g.reportError('p', 0);
    g.reset('p');
    expect(g.isThrottled('p', 50)).toBe(false);
  });

  it('rejects bad config', () => {
    expect(() => new PluginOverloadGuard({ maxErrorsPerWindow: 0, windowMs: 1, cooldownMs: 1 })).toThrow();
  });
});

describe('Phase 14 - AutosaveCoordinator', () => {
  it('saves after debounce window with no edits', () => {
    const a = new AutosaveCoordinator({ debounceMs: 100, maxDelayMs: 1000 });
    a.markDirty('doc1', 0);
    expect(a.shouldSave('doc1', 50)).toBe(false);
    expect(a.shouldSave('doc1', 100)).toBe(true);
  });

  it('forces save by maxDelay even if edits keep coming', () => {
    const a = new AutosaveCoordinator({ debounceMs: 100, maxDelayMs: 500 });
    a.markDirty('d', 0);
    a.markDirty('d', 100);
    a.markDirty('d', 200);
    a.markDirty('d', 400);
    expect(a.shouldSave('d', 450)).toBe(false);
    expect(a.shouldSave('d', 600)).toBe(true);
  });

  it('markSaved clears dirty', () => {
    const a = new AutosaveCoordinator({ debounceMs: 50, maxDelayMs: 500 });
    a.markDirty('d', 0);
    a.markSaved('d', 100);
    expect(a.isDirty('d')).toBe(false);
    expect(a.shouldSave('d', 200)).toBe(false);
  });

  it('pendingDocs lists docs ready for save', () => {
    const a = new AutosaveCoordinator({ debounceMs: 100, maxDelayMs: 1000 });
    a.markDirty('a', 0);
    a.markDirty('b', 50);
    expect(a.pendingDocs(120)).toEqual(['a']);
    expect(a.pendingDocs(200)).toEqual(['a', 'b']);
  });

  it('rejects bad config and missing docId', () => {
    expect(() => new AutosaveCoordinator({ debounceMs: 0, maxDelayMs: 100 })).toThrow();
    expect(() => new AutosaveCoordinator({ debounceMs: 200, maxDelayMs: 100 })).toThrow();
    const a = new AutosaveCoordinator({ debounceMs: 50, maxDelayMs: 100 });
    expect(() => a.markDirty('', 0)).toThrow();
  });
});
