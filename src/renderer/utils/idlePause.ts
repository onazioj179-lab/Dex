// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// IDLE PAUSE COORDINATOR
//
// Apple-style background pause: when the OS or user idles DEX (window hidden,
// blurred, or system idle threshold reached), in-app polling, animations,
// playback timers, and other background work should suspend. UI stays mounted
// and visible (no blank screen). When focus returns, work resumes.
//
// Events broadcast on `window`:
//   - 'dex:idle-pause'  : payload { reason: 'hidden' | 'blur' | 'system' }
//   - 'dex:idle-resume' : payload { reason: 'visible' | 'focus' | 'activity' }
//
// Apps can listen directly, or use the React `useIdlePause` hook.
// =============================================================================

import { useEffect, useRef, useState } from 'react';

export type IdleReason = 'hidden' | 'blur' | 'system';
export type ResumeReason = 'visible' | 'focus' | 'activity';

let _started = false;
let _isPaused = false;
let _lastActivity = Date.now();

function emit(name: 'dex:idle-pause', detail: { reason: IdleReason }): void;
function emit(name: 'dex:idle-resume', detail: { reason: ResumeReason }): void;
function emit(name: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function pause(_reason: IdleReason): void {
  // DISABLED by request: idle/blur must NOT affect DEX apps. Previously this
  // suspended in-app polling/animations/timers and triggered cache flushes,
  // which made the desktop read as "blank/off until you tap". Nothing pauses on
  // idle anymore -- every app keeps running fully. (resume() then never fires
  // because _isPaused stays false, which is correct.)
  return;
}

function resume(reason: ResumeReason): void {
  if (!_isPaused) return;
  _isPaused = false;
  _lastActivity = Date.now();
  emit('dex:idle-resume', { reason });
}

/**
 * Start the global idle coordinator. Idempotent. Call once at app startup.
 */
export function startIdlePauseCoordinator(_opts?: { systemIdleMs?: number }): void {
  if (_started) return;
  _started = true;
  if (typeof window === 'undefined') return;

  // Window hidden / visible (OS minimize, tab switch, lock screen, etc.)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pause('hidden');
    } else {
      resume('visible');
    }
  });

  // Window focus / blur (user clicked into another app)
  window.addEventListener('blur', () => pause('blur'));
  window.addEventListener('focus', () => resume('focus'));

  // User activity tracking for system-idle detection
  const onActivity = () => {
    _lastActivity = Date.now();
    if (_isPaused) resume('activity');
  };
  window.addEventListener('mousemove', onActivity, { passive: true });
  window.addEventListener('keydown', onActivity, { passive: true });
  window.addEventListener('pointerdown', onActivity, { passive: true });
  window.addEventListener('wheel', onActivity, { passive: true });

  // Visible system-idle intentionally does not pause the shell anymore.
  // The Home screen must remain fully rendered while the user is away,
  // even if that costs more power. Hidden/minimized/blurred states still
  // pause background app work through the listeners above.
}

/**
 * Imperative check.
 */
export function isIdlePaused(): boolean {
  return _isPaused;
}

/**
 * React hook -- returns current paused state and re-renders on transitions.
 * Components can branch their effects on this so timers/polling halt cleanly.
 *
 * Example:
 *   const paused = useIdlePause();
 *   useEffect(() => {
 *     if (paused) return;
 *     const id = setInterval(refresh, 5000);
 *     return () => clearInterval(id);
 *   }, [paused]);
 */
export function useIdlePause(): boolean {
  const [paused, setPaused] = useState(_isPaused);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const onPause = () => { if (mounted.current) setPaused(true); };
    const onResume = () => { if (mounted.current) setPaused(false); };
    window.addEventListener('dex:idle-pause', onPause);
    window.addEventListener('dex:idle-resume', onResume);
    return () => {
      mounted.current = false;
      window.removeEventListener('dex:idle-pause', onPause);
      window.removeEventListener('dex:idle-resume', onResume);
    };
  }, []);

  return paused;
}

/**
 * Stop the coordinator (test cleanup only).
 */
export function _stopIdlePauseCoordinator(): void {
  _started = false;
  _isPaused = false;
}
