// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { NativeWebview, slotUsable, MIN_CREATE_SIDE } from '../../src/renderer/components/NativeWebview';

describe('NativeWebview: no page view while DEX is minimized', () => {
  it('slotUsable needs a real size and a visible document', () => {
    expect(slotUsable({ width: 360, height: 1 }, false)).toBe(false); // minimized DEX lays the slot out ~1 px tall
    expect(slotUsable({ width: 1280, height: 692 }, true)).toBe(false);
    expect(slotUsable({ width: MIN_CREATE_SIDE, height: MIN_CREATE_SIDE }, false)).toBe(true);
    expect(slotUsable({ width: 1280, height: 692 }, false)).toBe(true);
  });

  let calls: Array<[string, unknown[]]>;
  let size = { w: 360, h: 1 };
  const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    size = { w: 360, h: 1 };
    rectSpy.mockImplementation(() => ({ left: 0, top: 108, right: size.w, bottom: 108 + size.h, width: size.w, height: size.h, x: 0, y: 108, toJSON: () => ({}) }) as DOMRect);
    (window as any).dex = { invoke: vi.fn(async (ch: string, ...args: unknown[]) => { calls.push([ch, args]); return { success: true }; }) };
    // jsdom has no hit-testing; the page slot is the only thing on screen here.
    (document as any).elementFromPoint = () => document.querySelector('[data-native-webview]');
  });
  afterEach(() => { vi.useRealTimers(); delete (window as any).dex; delete (document as any).elementFromPoint; });

  it('waits for a usable slot, then creates the view at its real size', async () => {
    await act(async () => { render(<NativeWebview tabId="t1" src="https://example.com/" active />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(calls.filter(([ch]) => ch === 'browserView:create')).toHaveLength(0);

    size = { w: 1280, h: 692 }; // DEX restored
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const creates = calls.filter(([ch]) => ch === 'browserView:create');
    expect(creates).toHaveLength(1);
    expect(creates[0][1][1]).toBe('https://example.com/');
    expect(creates[0][1][2]).toMatchObject({ w: 1280, h: 692 });
  });
});
