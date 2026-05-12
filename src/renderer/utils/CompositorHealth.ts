// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Compositor Health Monitor
 * -----------------------------------------------------------------------------
 * Listens to FrameGovernor `frame:budget-exceeded` events on dexBus and
 * applies a sustained-pressure policy:
 *
 *   - Single over-budget frame  -> ignored (transient hitch)
 *   - >= SUSTAINED_THRESHOLD over-budget frames within WINDOW_MS -> mark
 *     `<html data-compositor-pressure="high">` and emit a single console
 *     warning. Renderer styles can opt into reduced shadow / blur work via
 *     the attribute.
 *   - Auto-recovers after RECOVERY_MS of clean frames.
 *
 * This module never throttles work itself; it advertises pressure so other
 * subsystems (motion presets, blur layers, expensive overlays) can degrade
 * cooperatively. Pairs with MemoryPressureBridge for the memory axis.
 */

import { dexBus } from '../../shared/eventBus';

const SUSTAINED_THRESHOLD = 8;   // over-budget frames in window -> trigger
const WINDOW_MS = 1000;          // sliding window for over-budget counting
const RECOVERY_MS = 2000;        // clean window before clearing pressure

let armed = false;
let pressureHigh = false;
let lastWarnTs = 0;
const recentBreaches: number[] = [];
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

function trim(now: number): void {
  while (recentBreaches.length > 0 && now - recentBreaches[0] > WINDOW_MS) {
    recentBreaches.shift();
  }
}

function setPressure(high: boolean): void {
  if (high === pressureHigh) return;
  pressureHigh = high;
  if (typeof document === 'undefined') return;
  if (high) {
    document.documentElement.setAttribute('data-compositor-pressure', 'high');
  } else {
    document.documentElement.removeAttribute('data-compositor-pressure');
  }
}

function scheduleRecovery(): void {
  if (recoveryTimer !== null) clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => {
    const now = performance.now();
    trim(now);
    if (recentBreaches.length === 0) {
      setPressure(false);
      recoveryTimer = null;
    } else {
      scheduleRecovery();
    }
  }, RECOVERY_MS);
}

export function initCompositorHealth(): void {
  if (armed) return;
  armed = true;

  (dexBus as unknown as {
    on: (k: string, fn: (p: { workMs: number; budgetMs: number; refreshHz: number }) => void) => void;
  }).on('frame:budget-exceeded', (payload) => {
    const now = performance.now();
    recentBreaches.push(now);
    trim(now);

    if (!pressureHigh && recentBreaches.length >= SUSTAINED_THRESHOLD) {
      setPressure(true);
      // Coalesce warnings to once per 5s while under pressure.
      if (now - lastWarnTs > 5000) {
        lastWarnTs = now;
        // Single concise warning -- do not flood the console.
        console.warn(
          `[CompositorHealth] sustained over-budget: ` +
          `${recentBreaches.length} breaches in ${WINDOW_MS}ms ` +
          `(budget ${payload.budgetMs.toFixed(1)}ms @ ${payload.refreshHz}Hz)`
        );
      }
    }

    if (pressureHigh) scheduleRecovery();
  });
}

export function getCompositorPressure(): { high: boolean; recentBreaches: number } {
  trim(performance.now());
  return { high: pressureHigh, recentBreaches: recentBreaches.length };
}

/** For tests / HMR teardown. */
export function _resetCompositorHealth(): void {
  armed = false;
  pressureHigh = false;
  lastWarnTs = 0;
  recentBreaches.length = 0;
  if (recoveryTimer !== null) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-compositor-pressure');
  }
}
