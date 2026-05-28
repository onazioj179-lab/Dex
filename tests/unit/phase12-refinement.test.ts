// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import {
  ScrollFollowController,
  OverlayStack,
  OutputRingBuffer,
  FocusOwner,
  clampToViewport,
  predictSnapTarget,
  restoreWorkspace,
  AdaptiveQualityProfile,
  SoakMonitor,
  AdaptiveDebouncer,
} from '../../src/shared/phase12/refinementKit';

describe('Phase 12 - ScrollFollowController', () => {
  it('starts following and pauses when user scrolls up', () => {
    const c = new ScrollFollowController({ bottomThresholdPx: 10 });
    expect(c.isFollowing()).toBe(true);
    c.onUserScroll(100, 1000, 500); // distance = 400 -> pause
    expect(c.isFollowing()).toBe(false);
    expect(c.applyIfFollowing(1000)).toBeNull();
  });

  it('resumes follow when user scrolls back near bottom', () => {
    const c = new ScrollFollowController({ bottomThresholdPx: 10 });
    c.onUserScroll(100, 1000, 500);
    c.onUserScroll(495, 1000, 500); // distance 5 -> resume
    expect(c.isFollowing()).toBe(true);
    expect(c.applyIfFollowing(1000)).toBe(1000);
  });

  it('manual resume/pause works', () => {
    const c = new ScrollFollowController();
    c.pause();
    expect(c.isFollowing()).toBe(false);
    c.resume();
    expect(c.isFollowing()).toBe(true);
  });
});

describe('Phase 12 - OverlayStack', () => {
  it('push/pop and z-index ordering', () => {
    const s = new OverlayStack();
    s.push({ id: 'm1', kind: 'menu' });
    s.push({ id: 'mod', kind: 'modal' });
    expect(s.size()).toBe(2);
    expect(s.zIndexOf('mod')).toBeGreaterThan(s.zIndexOf('m1')!);
    expect(s.top()?.id).toBe('mod');
    expect(s.pop('mod')).toBe(true);
    expect(s.top()?.id).toBe('m1');
  });

  it('rejects duplicate ids and missing id push', () => {
    const s = new OverlayStack();
    s.push({ id: 'a', kind: 'menu' });
    expect(() => s.push({ id: 'a', kind: 'menu' })).toThrow();
    expect(() => s.push({ id: '', kind: 'menu' })).toThrow();
  });

  it('escape: top entry handler can swallow; otherwise top is popped', () => {
    const s = new OverlayStack();
    const handled = vi.fn(() => true);
    s.push({ id: 'a', kind: 'menu' });
    s.push({ id: 'b', kind: 'modal', onEscape: handled });
    expect(s.handleEscape()).toBe(true);
    expect(handled).toHaveBeenCalled();
    expect(s.size()).toBe(2); // b swallowed
    s.push({ id: 'c', kind: 'menu' });
    expect(s.handleEscape()).toBe(true); // c has no handler -> popped
    expect(s.top()?.id).toBe('b');
    expect(s.handleEscape()).toBe(true); // b swallows again
    expect(s.size()).toBe(2);
  });

  it('subscribe receives snapshots and isolates throwing listeners', () => {
    const s = new OverlayStack();
    const ok = vi.fn();
    s.subscribe(() => { throw new Error(); });
    s.subscribe(ok);
    s.push({ id: 'a', kind: 'menu' });
    expect(ok).toHaveBeenCalled();
  });

  it('onDismiss fires on pop', () => {
    const s = new OverlayStack();
    const dismiss = vi.fn();
    s.push({ id: 'a', kind: 'menu', onDismiss: dismiss });
    s.pop('a');
    expect(dismiss).toHaveBeenCalled();
  });
});

describe('Phase 12 - OutputRingBuffer', () => {
  it('preserves order under capacity', () => {
    const b = new OutputRingBuffer(3);
    b.push('a'); b.push('b');
    expect(b.toArray()).toEqual(['a', 'b']);
    expect(b.size()).toBe(2);
  });

  it('evicts oldest when full', () => {
    const b = new OutputRingBuffer(3);
    b.pushMany(['a', 'b', 'c', 'd', 'e']);
    expect(b.toArray()).toEqual(['c', 'd', 'e']);
    expect(b.size()).toBe(3);
  });

  it('tail returns last N', () => {
    const b = new OutputRingBuffer(5);
    b.pushMany(['1', '2', '3', '4', '5']);
    expect(b.tail(2)).toEqual(['4', '5']);
    expect(b.tail(10)).toEqual(['1', '2', '3', '4', '5']);
    expect(b.tail(0)).toEqual([]);
  });

  it('clear resets', () => {
    const b = new OutputRingBuffer(3);
    b.push('x');
    b.clear();
    expect(b.size()).toBe(0);
    expect(b.toArray()).toEqual([]);
  });

  it('rejects invalid capacity', () => {
    expect(() => new OutputRingBuffer(0)).toThrow();
    expect(() => new OutputRingBuffer(-1)).toThrow();
  });
});

describe('Phase 12 - FocusOwner', () => {
  it('changes owner and notifies', () => {
    const f = new FocusOwner();
    const evts: unknown[] = [];
    f.subscribe((e) => evts.push(e));
    expect(f.set('a')).toBe(true);
    expect(f.set('a')).toBe(false);
    expect(f.set('b')).toBe(true);
    expect(f.current()).toBe('b');
    expect(evts.length).toBe(2);
  });

  it('release only clears matching owner', () => {
    const f = new FocusOwner();
    f.set('a');
    expect(f.release('b')).toBe(false);
    expect(f.current()).toBe('a');
    expect(f.release('a')).toBe(true);
    expect(f.current()).toBeNull();
  });

  it('isolates listener errors', () => {
    const f = new FocusOwner();
    const ok = vi.fn();
    f.subscribe(() => { throw new Error(); });
    f.subscribe(ok);
    f.set('x');
    expect(ok).toHaveBeenCalled();
  });
});

describe('Phase 12 - clampToViewport', () => {
  const vp = { x: 0, y: 0, width: 1000, height: 600 };

  it('keeps in-bounds rect unchanged in dimensions', () => {
    const r = clampToViewport({ x: 100, y: 100, width: 200, height: 200 }, vp);
    expect(r.width).toBe(200);
    expect(r.height).toBe(200);
    expect(r.x).toBe(100);
  });

  it('clamps off-right and off-bottom', () => {
    const r = clampToViewport({ x: 9999, y: 9999, width: 200, height: 200 }, vp, 32);
    expect(r.x).toBeLessThan(vp.width);
    expect(r.y).toBeLessThan(vp.height);
  });

  it('shrinks rect larger than viewport', () => {
    const r = clampToViewport({ x: 0, y: 0, width: 9999, height: 9999 }, vp);
    expect(r.width).toBe(vp.width);
    expect(r.height).toBe(vp.height);
  });
});

describe('Phase 12 - predictSnapTarget', () => {
  const vp = { x: 0, y: 0, width: 1000, height: 600 };

  it('detects edges', () => {
    expect(predictSnapTarget({ x: 1, y: 100 }, vp)).toBe('left');
    expect(predictSnapTarget({ x: 999, y: 100 }, vp)).toBe('right');
    expect(predictSnapTarget({ x: 500, y: 1 }, vp)).toBe('maximize');
    expect(predictSnapTarget({ x: 500, y: 599 }, vp)).toBe('bottom');
  });

  it('returns null in center', () => {
    expect(predictSnapTarget({ x: 500, y: 300 }, vp)).toBeNull();
  });
});

describe('Phase 12 - restoreWorkspace', () => {
  const vp = { x: 0, y: 0, width: 1000, height: 600 };

  it('restores valid windows and quarantines stale apps', () => {
    const r = restoreWorkspace({
      viewport: vp,
      appAvailable: (id) => id !== 'gone',
      windows: [
        { id: 'w1', appId: 'editor', workspaceId: 'ws', z: 1, rect: { x: 10, y: 10, width: 200, height: 200 } },
        { id: 'w2', appId: 'gone', workspaceId: 'ws', z: 2, rect: { x: 0, y: 0, width: 100, height: 100 } },
      ],
    });
    expect(r.restored.map((w) => w.id)).toEqual(['w1']);
    expect(r.quarantined[0]!.reason).toBe('app-missing');
  });

  it('quarantines invalid rects', () => {
    const r = restoreWorkspace({
      viewport: vp,
      appAvailable: () => true,
      windows: [
        { id: 'bad', appId: 'a', workspaceId: 'ws', z: 1, rect: { x: 0, y: 0, width: 0, height: 100 } },
      ],
    });
    expect(r.restored.length).toBe(0);
    expect(r.quarantined[0]!.reason).toBe('invalid-rect');
  });

  it('clamps offscreen rects into viewport', () => {
    const r = restoreWorkspace({
      viewport: vp,
      appAvailable: () => true,
      windows: [
        { id: 'w', appId: 'a', workspaceId: 'ws', z: 1, rect: { x: 9999, y: 9999, width: 200, height: 200 } },
      ],
    });
    expect(r.restored[0]!.rect.x).toBeLessThan(vp.width);
  });

  it('sorts restored by z then id', () => {
    const r = restoreWorkspace({
      viewport: vp,
      appAvailable: () => true,
      windows: [
        { id: 'b', appId: 'a', workspaceId: 'ws', z: 2, rect: { x: 0, y: 0, width: 1, height: 1 } },
        { id: 'a', appId: 'a', workspaceId: 'ws', z: 1, rect: { x: 0, y: 0, width: 1, height: 1 } },
        { id: 'c', appId: 'a', workspaceId: 'ws', z: 2, rect: { x: 0, y: 0, width: 1, height: 1 } },
      ],
    });
    expect(r.restored.map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('Phase 12 - AdaptiveQualityProfile', () => {
  it('downgrades immediately', () => {
    const p = new AdaptiveQualityProfile('ultra', 4);
    expect(p.update({ frameTimeP95Ms: 40, gpuPressure: 'critical' })).toBe('eco');
  });

  it('upgrades only after hysteresis frames', () => {
    const p = new AdaptiveQualityProfile('eco', 3);
    const good = { frameTimeP95Ms: 8, gpuPressure: 'low' as const };
    expect(p.update(good)).toBe('eco');
    expect(p.update(good)).toBe('eco');
    expect(p.update(good)).toBe('ultra');
  });

  it('battery saver forces eco', () => {
    const p = new AdaptiveQualityProfile('ultra');
    expect(p.update({ frameTimeP95Ms: 8, gpuPressure: 'low', batterySaver: true })).toBe('eco');
  });
});

describe('Phase 12 - SoakMonitor', () => {
  it('flags memory drift and frametime creep', () => {
    const m = new SoakMonitor();
    for (let i = 0; i < 10; i++) {
      m.record({ at: i * 1000, memoryMb: 100 + i * 10, frameTimeMs: 8 + i });
    }
    const r = m.report(40, 2);
    const codes = r.issues.map((i) => i.code).sort();
    expect(codes).toContain('memory-drift');
    expect(codes).toContain('frametime-creep');
    expect(r.healthy).toBe(false);
  });

  it('healthy when stable', () => {
    const m = new SoakMonitor();
    for (let i = 0; i < 10; i++) {
      m.record({ at: i * 1000, memoryMb: 100, frameTimeMs: 10 });
    }
    expect(m.report().healthy).toBe(true);
  });

  it('handles too few samples', () => {
    const m = new SoakMonitor();
    m.record({ at: 0, memoryMb: 100, frameTimeMs: 10 });
    expect(m.report().healthy).toBe(true);
  });
});

describe('Phase 12 - AdaptiveDebouncer', () => {
  it('fires after quiet period with last value', () => {
    vi.useFakeTimers();
    const fired: number[] = [];
    const d = new AdaptiveDebouncer<number>((v) => fired.push(v), { minMs: 50, maxMs: 200 });
    d.push(1);
    d.push(2);
    d.push(3);
    vi.advanceTimersByTime(300);
    expect(fired).toEqual([3]);
    vi.useRealTimers();
  });

  it('flush fires immediately', () => {
    vi.useFakeTimers();
    const fired: number[] = [];
    const d = new AdaptiveDebouncer<number>((v) => fired.push(v));
    d.push(7);
    d.flush();
    expect(fired).toEqual([7]);
    vi.useRealTimers();
  });

  it('cancel discards pending value', () => {
    vi.useFakeTimers();
    const fired: number[] = [];
    const d = new AdaptiveDebouncer<number>((v) => fired.push(v));
    d.push(1);
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fired).toEqual([]);
    vi.useRealTimers();
  });
});
