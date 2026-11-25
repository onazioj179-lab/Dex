// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContactTracker, multiDelta, MAX_CONTACTS } from '../../src/renderer/shell/input/touchContacts';
import { gestureCamera, pinchCamera } from '../../src/renderer/shell/spatial/spatialMath';
import { haptic, hapticSupport, setHapticsEnabled, __resetHapticsForTests } from '../../src/renderer/shell/input/haptics';
import { GestureRecognizer } from '../../src/renderer/utils/TouchInputSystem';

const ev = (id: number, x: number, y: number, extra: Partial<{ isPrimary: boolean; pointerType: string; width: number; height: number }> = {}) =>
  ({ pointerId: id, pointerType: extra.pointerType ?? 'touch', clientX: x, clientY: y, isPrimary: extra.isPrimary ?? false, width: extra.width, height: extra.height });

describe('multiDelta', () => {
  it('pure translation for any number of contacts', () => {
    const prev = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 5, y: 5 }];
    const next = prev.map((p) => ({ x: p.x + 7, y: p.y - 3 }));
    const d = multiDelta(prev, next);
    expect(d.count).toBe(5);
    expect(d.dx).toBeCloseTo(7);
    expect(d.dy).toBeCloseTo(-3);
    expect(d.scale).toBeCloseTo(1);
    expect(d.rotation).toBeCloseTo(0);
  });

  it('spread doubles the scale about the centroid', () => {
    const prev = [{ x: 90, y: 100 }, { x: 110, y: 100 }, { x: 100, y: 90 }];
    const c = { x: 100, y: 290 / 3 };
    const d = multiDelta(prev, prev.map((p) => ({ x: c.x + (p.x - c.x) * 2, y: c.y + (p.y - c.y) * 2 })));
    expect(d.scale).toBeCloseTo(2, 6);
    expect(d.dx).toBeCloseTo(0);
    expect(d.dy).toBeCloseTo(0);
  });

  it('measures a quarter-turn rotation', () => {
    const prev = [{ x: -10, y: 0 }, { x: 10, y: 0 }];
    const next = [{ x: 0, y: -10 }, { x: 0, y: 10 }];
    expect(Math.abs(multiDelta(prev, next).rotation)).toBeCloseTo(Math.PI / 2, 5);
  });

  it('handles one and zero contacts', () => {
    expect(multiDelta([], []).count).toBe(0);
    const d = multiDelta([{ x: 1, y: 1 }], [{ x: 4, y: 5 }]);
    expect(d).toMatchObject({ count: 1, dx: 3, dy: 4, scale: 1, rotation: 0 });
  });
});

describe('ContactTracker', () => {
  it('tracks ten simultaneous contacts by stable id and refuses an eleventh', () => {
    const t = new ContactTracker();
    for (let i = 0; i < MAX_CONTACTS; i++) expect(t.down(ev(100 + i, i * 10, 0, { isPrimary: i === 0 }))).not.toBeNull();
    expect(t.count).toBe(10);
    expect(t.down(ev(999, 0, 0))).toBeNull();
    expect(t.count).toBe(10);
    expect(t.peakCount).toBe(10);
    expect(t.list().map((c) => c.id)).toEqual(Array.from({ length: 10 }, (_, i) => 100 + i));
  });

  it('moving one of N contacts yields a group delta over all of them', () => {
    const t = new ContactTracker();
    t.down(ev(1, 0, 0, { isPrimary: true }));
    t.down(ev(2, 100, 0));
    t.down(ev(3, 50, 100));
    const d = t.move(ev(2, 130, 0))!;
    expect(d.count).toBe(3);
    expect(d.dx).toBeCloseTo(10);
    expect(t.move(ev(42, 0, 0))).toBeNull();
  });

  it('a new primary touch drops contacts whose pointerup was lost', () => {
    const t = new ContactTracker();
    t.down(ev(1, 0, 0, { isPrimary: true }));
    t.down(ev(2, 10, 10));
    // Both pointerups lost (e.g. swallowed by an app), then a fresh first finger:
    t.down(ev(3, 50, 50, { isPrimary: true }));
    expect(t.count).toBe(1);
    expect(t.has(3)).toBe(true);
  });

  it('rejects palm-sized contacts only when asked (pen in use)', () => {
    const t = new ContactTracker();
    expect(t.down(ev(1, 0, 0, { width: 40, height: 40 }), { rejectPalm: true })).toBeNull();
    expect(t.down(ev(2, 0, 0, { width: 40, height: 40 }))).not.toBeNull();
    expect(t.down(ev(3, 0, 0, { width: 8, height: 8 }), { rejectPalm: true })).not.toBeNull();
  });

  it('up removes and travel follows the centroid', () => {
    const t = new ContactTracker();
    t.down(ev(1, 0, 0, { isPrimary: true }));
    t.down(ev(2, 10, 0));
    t.move(ev(1, 20, 20));
    t.move(ev(2, 30, 20));
    expect(t.travel()).toEqual({ x: 20, y: 20 });
    expect(t.up(1)?.id).toBe(1);
    expect(t.count).toBe(1);
  });
});

describe('gestureCamera', () => {
  it('matches the two-finger pinchCamera for two contacts', () => {
    const cam = { x: 0, y: 0, z: 1 };
    const prev: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
    const next: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 90, y: 110 }, { x: 230, y: 110 }];
    const a = pinchCamera(cam, prev, next);
    const b = gestureCamera(cam, multiDelta(prev, next));
    expect(b.z).toBeCloseTo(a.z);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeCloseTo(a.y);
  });
});

describe('haptics', () => {
  beforeEach(() => { __resetHapticsForTests(); localStorage.clear(); });

  it('never fires on desktop hardware even though the API exists', () => {
    const vib = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vib, configurable: true });
    expect(hapticSupport()).not.toBe('available'); // jsdom UA is not mobile, no touch points
    expect(haptic('snap')).toBe(false);
    expect(vib).not.toHaveBeenCalled();
  });

  it('fires once per gap, and never when turned off, on mobile touch hardware', () => {
    const vib = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vib, configurable: true });
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Mobile');
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 10, configurable: true });
    try {
      expect(hapticSupport()).toBe('available');
      expect(haptic('snap', 1000)).toBe(true);
      expect(haptic('snap', 1020)).toBe(false); // rate-limited
      expect(haptic('snap', 1200)).toBe(true);
      setHapticsEnabled(false);
      expect(haptic('snap', 2000)).toBe(false);
      expect(vib).toHaveBeenCalledTimes(2);
    } finally {
      ua.mockRestore();
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    }
  });
});

describe('GestureRecognizer (global)', () => {
  const pe = (type: string, id: number, x: number, y: number, init: Partial<PointerEventInit> = {}) =>
    new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: false, ...init });

  it('emits a desktop pinch once per gesture and marks pinches inside apps', () => {
    const root = document.createElement('div');
    const app = document.createElement('div');
    app.setAttribute('data-app-id', 'prism');
    root.appendChild(app);
    document.body.appendChild(root);
    const g = new GestureRecognizer();
    g.attach(root);
    const seen: Array<{ type: string; onDesktop?: boolean }> = [];
    g.on('two-finger-spread', (e) => seen.push({ type: e.type, onDesktop: e.onDesktop }));

    root.dispatchEvent(pe('pointerdown', 1, 100, 100, { isPrimary: true }));
    root.dispatchEvent(pe('pointerdown', 2, 120, 100));
    for (let x = 130; x < 260; x += 20) root.dispatchEvent(pe('pointermove', 2, x, 100));
    expect(seen).toEqual([{ type: 'two-finger-spread', onDesktop: true }]);
    root.dispatchEvent(pe('pointerup', 1, 100, 100));
    root.dispatchEvent(pe('pointerup', 2, 250, 100));
    expect(g.contactCount).toBe(0);

    app.dispatchEvent(pe('pointerdown', 3, 100, 100, { isPrimary: true }));
    app.dispatchEvent(pe('pointerdown', 4, 120, 100));
    app.dispatchEvent(pe('pointermove', 4, 200, 100));
    expect(seen[1]).toEqual({ type: 'two-finger-spread', onDesktop: false });
    g.destroy();
    root.remove();
  });

  it('still sees a pointerup an app stopped from propagating', () => {
    const root = document.createElement('div');
    const btn = document.createElement('button');
    btn.addEventListener('pointerup', (e) => e.stopPropagation());
    root.appendChild(btn);
    document.body.appendChild(root);
    const g = new GestureRecognizer();
    g.attach(root);
    btn.dispatchEvent(pe('pointerdown', 7, 5, 5, { isPrimary: true }));
    expect(g.contactCount).toBe(1);
    btn.dispatchEvent(pe('pointerup', 7, 5, 5));
    expect(g.contactCount).toBe(0);
    g.destroy();
    root.remove();
  });
});

describe('GestureRecognizer: home and desktop gestures', () => {
  const pe = (type: string, id: number, x: number, y: number, init: Partial<PointerEventInit> = {}) =>
    new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: false, ...init });

  it('emits edge-swipe-up once for a touch drag up from the bottom edge, not from mid-screen', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const g = new GestureRecognizer();
    g.attach(root);
    const seen: string[] = [];
    g.on('edge-swipe-up', (e) => seen.push(e.type));
    const bottom = window.innerHeight - 4;
    root.dispatchEvent(pe('pointerdown', 21, 300, bottom, { isPrimary: true }));
    for (let y = bottom - 20; y > bottom - 200; y -= 20) root.dispatchEvent(pe('pointermove', 21, 302, y));
    root.dispatchEvent(pe('pointerup', 21, 302, bottom - 200));
    // Same drag from the middle of the screen: no gesture.
    root.dispatchEvent(pe('pointerdown', 22, 300, 300, { isPrimary: true }));
    for (let y = 280; y > 100; y -= 20) root.dispatchEvent(pe('pointermove', 22, 300, y));
    root.dispatchEvent(pe('pointerup', 22, 300, 100));
    expect(seen).toEqual(['edge-swipe-up']);
  });

  it('emits three-finger-swipe-down once per gesture', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const g = new GestureRecognizer();
    g.attach(root);
    const seen: string[] = [];
    g.on('three-finger-swipe-down', (e) => seen.push(e.type));
    root.dispatchEvent(pe('pointerdown', 31, 100, 100, { isPrimary: true }));
    root.dispatchEvent(pe('pointerdown', 32, 140, 100));
    root.dispatchEvent(pe('pointerdown', 33, 180, 100));
    for (let y = 120; y <= 260; y += 20) {
      root.dispatchEvent(pe('pointermove', 31, 100, y));
      root.dispatchEvent(pe('pointermove', 32, 140, y));
      root.dispatchEvent(pe('pointermove', 33, 180, y));
    }
    for (const id of [31, 32, 33]) root.dispatchEvent(pe('pointerup', id, 100, 260));
    expect(seen).toEqual(['three-finger-swipe-down']);
  });
});
