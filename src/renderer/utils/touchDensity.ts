// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Touch density (Settings › Touch & Pen). "Automatic" follows the hardware:
 * touch when touch is the main input. "Touch" enlarges shell controls (menus,
 * Control Center, DEX Bar) and extends every button's hit area to 44 px;
 * "Precision" keeps the compact desktop sizes even on a touch screen.
 *
 * Applied as `data-dex-density` on <html> (an attribute, never a [style]
 * selector, so it costs one restyle when changed and nothing otherwise).
 */
export type DensityChoice = 'auto' | 'touch' | 'precision';
export type Density = 'touch' | 'precision';

const KEY = 'dex-touch-density';
const listeners = new Set<(c: DensityChoice) => void>();
let mq: MediaQueryList | null = null;

export function getDensityChoice(): DensityChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'touch' || v === 'precision' ? v : 'auto';
  } catch { return 'auto'; }
}

export function resolveDensity(choice: DensityChoice, coarsePrimary: boolean): Density {
  if (choice === 'auto') return coarsePrimary ? 'touch' : 'precision';
  return choice;
}

function coarsePrimary(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
}

export function applyDensity(choice: DensityChoice = getDensityChoice()): Density {
  const d = resolveDensity(choice, coarsePrimary());
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-dex-density', d);
  return d;
}

export function setDensityChoice(choice: DensityChoice): void {
  try { if (choice === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch { /* private mode */ }
  applyDensity(choice);
  listeners.forEach((l) => l(choice));
}

export function subscribeDensity(l: (c: DensityChoice) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Apply at boot and follow touch screens being attached/detached in Automatic. */
export function initTouchDensity(): void {
  applyDensity();
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function' || mq) return;
  mq = window.matchMedia('(pointer: coarse)');
  mq.addEventListener?.('change', () => { if (getDensityChoice() === 'auto') applyDensity('auto'); });
}
