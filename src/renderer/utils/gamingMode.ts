// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Gaming readiness helpers (Phase 6).
 *
 * Lightweight renderer-side helpers for putting an app or its container into
 * "game-ready" mode: requests browser exclusive fullscreen, hints the
 * compositor to prioritise the current frame, and exposes a simple
 * suspend/resume API for shell chrome that should hide while a game is
 * running.
 *
 * This module intentionally does NOT touch GPU drivers, controller APIs, or
 * Vulkan/OpenGL pipelines directly - those are surfaces for the native side
 * to expose later. It provides the renderer-facing entry points so creative
 * apps (Imosion preview, Forge live render, Canvas full-screen present) and
 * any future game shells share one consistent contract.
 */

export type GamingMode = 'off' | 'performance' | 'exclusive';

export interface GamingThrottleHandle {
  release: () => Promise<void>;
}

interface GamingState {
  mode: GamingMode;
  element: HTMLElement | null;
  throttleHandle: GamingThrottleHandle | null;
}

const state: GamingState = { mode: 'off', element: null, throttleHandle: null };
const listeners = new Set<(mode: GamingMode) => void>();

export const GAMING_CHROMIUM_FLAGS = [
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--enable-gpu-rasterization',
  '--enable-zero-copy',
] as const;

function emit(mode: GamingMode): void {
  state.mode = mode;
  document.documentElement.setAttribute('data-gaming-mode', mode);
  listeners.forEach(listener => {
    try { listener(mode); } catch { /* swallow */ }
  });
}

export function onGamingModeChange(listener: (mode: GamingMode) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getGamingMode(): GamingMode {
  return state.mode;
}

export function getGamingChromiumFlagHint(): readonly string[] {
  return GAMING_CHROMIUM_FLAGS;
}

export async function preventThrottling(): Promise<GamingThrottleHandle> {
  let released = false;
  const wakeLock = typeof navigator !== 'undefined' && navigator.wakeLock
    ? await navigator.wakeLock.request('screen').catch(() => null)
    : null;

  const previousFocus = document.documentElement.getAttribute('data-game-focus');
  document.documentElement.setAttribute('data-game-focus', 'active');

  const handle: GamingThrottleHandle = {
    release: async () => {
      if (released) return;
      released = true;
      if (previousFocus === null) {
        document.documentElement.removeAttribute('data-game-focus');
      } else {
        document.documentElement.setAttribute('data-game-focus', previousFocus);
      }
      if (wakeLock) {
        await wakeLock.release().catch(() => undefined);
      }
      if (state.throttleHandle === handle) {
        state.throttleHandle = null;
      }
    },
  };

  state.throttleHandle = handle;
  return handle;
}

/**
 * Enter fullscreen + performance mode for a target element. Falls back
 * gracefully when the Fullscreen API is unavailable.
 */
export async function enterExclusiveFullscreen(target: HTMLElement): Promise<boolean> {
  try {
    await preventThrottling();
    if (!target.requestFullscreen) {
      emit('performance');
      state.element = target;
      return false;
    }
    await target.requestFullscreen({ navigationUI: 'hide' });
    state.element = target;
    emit('exclusive');
    return true;
  } catch {
    emit('off');
    return false;
  }
}

export async function exitGamingMode(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // ignore
  }
  if (state.throttleHandle) {
    await state.throttleHandle.release();
  }
  state.element = null;
  emit('off');
}

/**
 * Performance mode without fullscreen - used by previews that want shell
 * chrome dimmed and the compositor to prioritise their frames.
 */
export function enterPerformanceMode(target: HTMLElement | null = null): void {
  state.element = target;
  void preventThrottling();
  emit('performance');
}

/**
 * Listen for the user pressing Escape or the OS exiting fullscreen so we can
 * tear down state. Idempotent - safe to call once at startup.
 */
let installed = false;
export function installGamingListeners(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.mode === 'exclusive') {
      state.element = null;
      emit('off');
    }
  });
}
