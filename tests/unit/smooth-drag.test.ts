// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSmoothDrag } from '../../src/renderer/hooks/useSmoothDrag';

// Run rAF callbacks synchronously so the position commit is deterministic.
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

function ptr(clientX: number, clientY: number, extra: Record<string, unknown> = {}) {
  return {
    button: 0, clientX, clientY, pointerId: 1,
    preventDefault() {}, stopPropagation() {},
    currentTarget: { setPointerCapture() {}, releasePointerCapture() {} },
    ...extra,
  } as unknown as React.PointerEvent;
}

describe('useSmoothDrag', () => {
  it('ignores movement below the threshold (a click, not a drag)', () => {
    const onCommit = vi.fn();
    const onRelease = vi.fn();
    const { result } = renderHook(() => useSmoothDrag({ x: 100, y: 100, onCommit, onRelease, threshold: 5 }));

    act(() => { result.current.handlers.onPointerDown(ptr(0, 0)); });
    act(() => { result.current.handlers.onPointerMove(ptr(3, 2)); }); // under 5px
    act(() => { result.current.handlers.onPointerUp(ptr(3, 2)); });

    expect(result.current.dragging).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onRelease).toHaveBeenCalledWith(expect.anything(), false); // moved=false
  });

  it('commits the final position once on release after a real drag', () => {
    const onCommit = vi.fn();
    const onRelease = vi.fn();
    const { result } = renderHook(() => useSmoothDrag({ x: 100, y: 100, onCommit, onRelease, threshold: 4 }));

    act(() => { result.current.handlers.onPointerDown(ptr(10, 10)); });
    act(() => { result.current.handlers.onPointerMove(ptr(60, 40)); }); // +50, +30
    expect(result.current.dragging).toBe(true);
    expect(result.current.x).toBe(150); // 100 + 50
    expect(result.current.y).toBe(130); // 100 + 30

    act(() => { result.current.handlers.onPointerUp(ptr(60, 40)); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(150, 130);
    expect(onRelease).toHaveBeenCalledWith(expect.anything(), true); // moved=true
    expect(result.current.dragging).toBe(false);
  });

  it('applies the clamp to the live position and the commit', () => {
    const onCommit = vi.fn();
    const clamp = (x: number, y: number) => ({ x: Math.min(x, 120), y: Math.min(y, 120) });
    const { result } = renderHook(() => useSmoothDrag({ x: 100, y: 100, onCommit, clamp, threshold: 4 }));

    act(() => { result.current.handlers.onPointerDown(ptr(0, 0)); });
    act(() => { result.current.handlers.onPointerMove(ptr(500, 500)); }); // would be 600,600
    expect(result.current.x).toBe(120);
    expect(result.current.y).toBe(120);
    act(() => { result.current.handlers.onPointerUp(ptr(500, 500)); });
    expect(onCommit).toHaveBeenCalledWith(120, 120);
  });

  it('does nothing when disabled', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useSmoothDrag({ x: 5, y: 5, onCommit, disabled: true }));
    act(() => { result.current.handlers.onPointerDown(ptr(0, 0)); });
    act(() => { result.current.handlers.onPointerMove(ptr(100, 100)); });
    expect(result.current.dragging).toBe(false);
    expect(result.current.x).toBe(5);
  });
});
