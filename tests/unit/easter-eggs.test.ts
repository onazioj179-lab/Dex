// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KONAMI, konamiStep, createTapCounter, discoverEasterEgg, foundEasterEggs, EASTER_EGG_EVENT,
} from '../../src/renderer/services/easterEggs';

describe('easter eggs', () => {
  beforeEach(() => localStorage.removeItem('dex-easter-eggs-found'));

  it('matches the Konami code, including a stuttered start', () => {
    let p = 0;
    for (const k of KONAMI) p = konamiStep(p, k);
    expect(p).toBe(KONAMI.length);
    p = 0;
    for (const k of ['ArrowUp', ...KONAMI]) p = konamiStep(p, k);
    expect(p).toBe(KONAMI.length);
    // Capital B/A (caps lock) still count.
    p = 0;
    for (const k of [...KONAMI.slice(0, 8), 'B', 'A']) p = konamiStep(p, k);
    expect(p).toBe(KONAMI.length);
  });

  it('a wrong key restarts the code', () => {
    let p = 0;
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'x']) p = konamiStep(p, k);
    expect(p).toBe(0);
  });

  it('tap counter fires on the 7th quick tap only', () => {
    let t = 0;
    const c = createTapCounter(7, 3000, () => t);
    for (let i = 0; i < 6; i++) { expect(c.tap()).toBe(false); t += 100; }
    expect(c.tap()).toBe(true);
    // Slow taps never fire.
    for (let i = 0; i < 10; i++) { t += 4000; expect(c.tap()).toBe(false); }
  });

  it('counts each egg once toward the achievement stat', () => {
    const bumps = vi.fn();
    const eggs = vi.fn();
    const onBump = (e: Event) => bumps((e as CustomEvent).detail);
    const onEgg = (e: Event) => eggs((e as CustomEvent).detail);
    window.addEventListener('dex-stat-bump', onBump);
    window.addEventListener(EASTER_EGG_EVENT, onEgg);
    expect(discoverEasterEgg('konami')).toBe(true);
    expect(discoverEasterEgg('konami')).toBe(false);
    expect(discoverEasterEgg('uki-42')).toBe(true);
    window.removeEventListener('dex-stat-bump', onBump);
    window.removeEventListener(EASTER_EGG_EVENT, onEgg);
    expect(bumps).toHaveBeenCalledTimes(2);
    expect(bumps).toHaveBeenCalledWith({ key: 'easterEggsFound', amount: 1 });
    expect(eggs).toHaveBeenCalledTimes(3);
    expect(foundEasterEggs()).toEqual(['konami', 'uki-42']);
  });
});
