// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import type { RefObject } from 'react';
import { useAppActive } from '../../src/renderer/utils/perfAware';

/**
 * Build a desktop with two app containers — a backgrounded "nexus" (with an inner
 * canvas to anchor a ref) and a foregrounded "calculator". This is the exact
 * scenario the per-app bug got wrong: a foreground container EXISTS, but it is
 * not ours.
 */
function setupDesktop() {
  document.body.innerHTML = '';
  const desktop = document.createElement('div');

  const nexus = document.createElement('div');
  nexus.setAttribute('data-app-container', '');
  nexus.setAttribute('data-app-id', 'nexus');
  nexus.setAttribute('data-app-state', 'background');
  const inner = document.createElement('canvas');
  nexus.appendChild(inner);

  const calc = document.createElement('div');
  calc.setAttribute('data-app-container', '');
  calc.setAttribute('data-app-id', 'calculator');
  calc.setAttribute('data-app-state', 'foreground');

  desktop.appendChild(nexus);
  desktop.appendChild(calc);
  document.body.appendChild(desktop);
  return { nexus, inner, calc };
}

const refTo = (el: HTMLElement): RefObject<HTMLElement> => ({ current: el });

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useAppActive (per-app foreground detection)', () => {
  it('returns false when OUR app is backgrounded, even if another app is foreground', () => {
    const { inner } = setupDesktop();
    const { result } = renderHook(() => useAppActive(refTo(inner)));
    // The bug returned true here (it read the global foreground = calculator).
    expect(result.current).toBe(false);
  });

  it('returns true when our own container is foreground', () => {
    const { nexus, inner } = setupDesktop();
    nexus.setAttribute('data-app-state', 'foreground');
    const { result } = renderHook(() => useAppActive(refTo(inner)));
    expect(result.current).toBe(true);
  });

  it('flips to false (pauses) when our container is backgrounded live', async () => {
    const { nexus, inner } = setupDesktop();
    nexus.setAttribute('data-app-state', 'foreground');
    const { result } = renderHook(() => useAppActive(refTo(inner)));
    expect(result.current).toBe(true);
    // Background us (a sibling becomes foreground): the MutationObserver should react.
    nexus.setAttribute('data-app-state', 'background');
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('flips back to true (instant resume) when re-foregrounded', async () => {
    const { nexus, inner } = setupDesktop();
    const { result } = renderHook(() => useAppActive(refTo(inner)));
    expect(result.current).toBe(false);
    nexus.setAttribute('data-app-state', 'foreground');
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('without a ref, falls back to the (approximate) global foreground signal', () => {
    setupDesktop(); // calculator is foreground
    const { result } = renderHook(() => useAppActive());
    // Documented back-compat fallback: any foreground app reads as active.
    expect(result.current).toBe(true);
  });
});
