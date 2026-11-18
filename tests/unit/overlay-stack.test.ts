// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pushOverlay, isTopOverlay, clampToViewport, _resetOverlayStack, overlayDepth } from '../../src/renderer/services/overlayStack';

describe('overlay stack', () => {
  beforeEach(() => _resetOverlayStack());

  it('Escape closes only the top overlay, then the next', () => {
    const a = vi.fn(), b = vi.fn();
    const ra = pushOverlay({ id: 'a', close: a });
    const rb = pushOverlay({ id: 'b', close: b });
    expect(rb.z).toBeGreaterThan(ra.z);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    rb.release();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(a).toHaveBeenCalledTimes(1);
    ra.release();
    expect(overlayDepth()).toBe(0);
  });

  it('an ownEscape overlay keeps Escape for itself and blocks the ones below', () => {
    const a = vi.fn();
    pushOverlay({ id: 'a', close: a });
    pushOverlay({ id: 'menu', close: vi.fn(), ownEscape: true });
    expect(isTopOverlay('menu')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(a).not.toHaveBeenCalled();
  });

  it('outside clicks close the top overlay; clicks inside do not', () => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const close = vi.fn();
    pushOverlay({ id: 'pop', close, contains: (t) => el.contains(t) });
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(close).not.toHaveBeenCalled();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns focus to where it was', () => {
    const btn = document.createElement('button'); document.body.appendChild(btn); btn.focus();
    const r = pushOverlay({ id: 'f', close: () => {}, restoreFocus: btn });
    (document.activeElement as HTMLElement)?.blur();
    r.release();
    expect(document.activeElement).toBe(btn);
  });

  it('clamps a popup into the viewport', () => {
    expect(clampToViewport(1000, 700, 300, 200, 1024, 768)).toEqual({ x: 716, y: 560 });
    expect(clampToViewport(-50, -5, 100, 100, 1024, 768)).toEqual({ x: 8, y: 8 });
  });
});
