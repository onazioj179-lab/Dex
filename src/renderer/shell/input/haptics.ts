// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Haptic feedback, only where a real actuator is reachable. The Vibration API
// is present in desktop Chromium/WebView2 too, where it silently does nothing,
// so its presence alone proves nothing: DEX only calls it on a touch device that
// identifies as mobile hardware. Everything is a short, single pulse for a
// meaningful moment (snap, selection, gesture boundary) and rate-limited, never
// per pointer move. The user can turn it off (Settings > Touch & Pen); visual
// feedback always happens regardless.
//

import { touchCapabilities } from './touchContacts';

export type HapticKind = 'snap' | 'select' | 'boundary' | 'confirm';

const PATTERNS: Record<HapticKind, number | number[]> = {
  snap: 8,
  select: 6,
  boundary: [6, 40, 6],
  confirm: 12,
};

const PREF_KEY = 'dex-haptics-enabled';
const MIN_GAP_MS = 80;
let last = 0;
let enabledCache: boolean | null = null;
const listeners = new Set<(on: boolean) => void>();

export type HapticSupport = 'available' | 'no-actuator' | 'no-api';

/** Whether this device can actually vibrate for DEX. */
export function hapticSupport(): HapticSupport {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return 'no-api';
  const ua = navigator.userAgent || '';
  const mobileHardware = /Android|iPhone|iPad|Mobile/i.test(ua) || (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true;
  return mobileHardware && touchCapabilities().maxTouchPoints > 0 ? 'available' : 'no-actuator';
}

export function hapticsEnabled(): boolean {
  if (enabledCache === null) {
    try { enabledCache = localStorage.getItem(PREF_KEY) !== 'false'; } catch { enabledCache = true; }
  }
  return enabledCache;
}

export function setHapticsEnabled(on: boolean): void {
  enabledCache = on;
  try { localStorage.setItem(PREF_KEY, on ? 'true' : 'false'); } catch { /* private mode: session only */ }
  for (const l of listeners) l(on);
}

export function subscribeHaptics(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Fires one pulse if supported, enabled and not too soon after the last. Returns whether it fired. */
export function haptic(kind: HapticKind, now: number = Date.now()): boolean {
  if (!hapticsEnabled() || hapticSupport() !== 'available') return false;
  if (now - last < MIN_GAP_MS) return false;
  last = now;
  try { return navigator.vibrate(PATTERNS[kind]); } catch { return false; }
}

/** Test hook. */
export function __resetHapticsForTests(): void { last = 0; enabledCache = null; }
