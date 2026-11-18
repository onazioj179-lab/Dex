// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX Resource Coordinator: one memory-pressure signal for the whole shell.
//
// Source: the native system status (real used/total memory, one persistent
// sysinfo sampler, so a reading costs a memory refresh, not a process scan).
// Sampled every 30 s, only while DEX is visible. Levels:
//   normal    below 80% of RAM in use
//   high      80-90%: optional work shrinks (Browser keeps 1 background tab awake,
//                      AXL keeps 16 spare GPU meshes)
//   critical  90%+:   only what is on screen stays live (Browser: the open tab only;
//                      AXL: only the meshes it is drawing)
// Hysteresis (3 points) keeps the level from flapping at a boundary. Nothing is
// ever closed or discarded because of this: background tabs SLEEP and reload on
// selection, and protected tabs (sound, edited fields, Keep awake) stay awake.

import { create } from 'zustand';

export type PressureLevel = 'normal' | 'high' | 'critical';

export const HIGH_AT = 80;
export const CRITICAL_AT = 90;
const HYSTERESIS = 3;
const SAMPLE_MS = 30_000;

/** Next level from the current one and the % of RAM in use (with hysteresis). */
export function nextPressure(current: PressureLevel, usedPct: number): PressureLevel {
  if (!Number.isFinite(usedPct)) return current;
  if (usedPct >= CRITICAL_AT) return 'critical';
  if (current === 'critical' && usedPct >= CRITICAL_AT - HYSTERESIS) return 'critical';
  if (usedPct >= HIGH_AT) return 'high';
  if (current !== 'normal' && usedPct >= HIGH_AT - HYSTERESIS) return 'high';
  return 'normal';
}

/** The Browser's live background-tab budget under pressure (never raises it). */
export function budgetUnderPressure(budget: number, level: PressureLevel): number {
  if (level === 'critical') return 0;
  if (level === 'high') return Math.min(budget, 1);
  return budget;
}

interface PressureState { level: PressureLevel; usedPct: number | null; at: number | null }
export const useResourcePressure = create<PressureState>(() => ({ level: 'normal', usedPct: null, at: null }));

let started = false;
export function startResourceCoordinator(): void {
  if (started || typeof window === 'undefined') return;
  const dex = (window as unknown as { dex?: { invoke?: (c: string) => Promise<any> } }).dex;
  if (!dex?.invoke) return; // web preview: no native memory reading, stay 'normal'
  started = true;
  const sample = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const st = await dex.invoke!('system:getStatus');
      const pct = Number(st?.memory?.percent);
      if (!Number.isFinite(pct)) return;
      const prev = useResourcePressure.getState().level;
      const level = nextPressure(prev, pct);
      useResourcePressure.setState({ level, usedPct: Math.round(pct), at: Date.now() });
      if (level !== prev && level !== 'normal') {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: {
          type: 'info',
          message: level === 'critical'
            ? `Memory is ${Math.round(pct)}% used: Browser keeps only the open tab awake and AXL frees off-screen models until it eases.`
            : `Memory is ${Math.round(pct)}% used: Browser keeps fewer tabs awake and AXL frees spare models.`,
        } }));
      }
    } catch { /* bridge busy: try next time */ }
  };
  void sample();
  window.setInterval(() => { void sample(); }, SAMPLE_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void sample(); });
}
