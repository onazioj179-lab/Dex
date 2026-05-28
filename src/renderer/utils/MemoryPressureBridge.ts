// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Memory Pressure Bridge
 * -----------------------------------------------------------------------------
 * Receives 'memory:pressure' events from the main process (PlatformNative
 * OSMemoryPressureMonitor) and:
 *   1. Re-emits on dexBus so React components can subscribe.
 *   2. Sets a global degradation flag for animation systems.
 *   3. Pauses the FrameGovernor on critical pressure.
 *
 * Side-effect import only: import './utils/MemoryPressureBridge' once at
 * renderer boot. Safe to import multiple times (singleton guard).
 */

import { dexBus } from '../../shared/eventBus';
import { FrameGovernor } from './FrameGovernor';

let installed = false;

export type DegradationLevel = 'none' | 'reduced' | 'minimal';

interface State {
  level: DegradationLevel;
  lastEventAt: number;
  relaxTimer: ReturnType<typeof setTimeout> | null;
}

const state: State = { level: 'none', lastEventAt: 0, relaxTimer: null };

/** Current degradation hint. Animation systems can poll this cheaply. */
export function getDegradationLevel(): DegradationLevel {
  return state.level;
}

/** True when callers should skip non-essential animations. */
export function shouldSimplifyMotion(): boolean {
  return state.level !== 'none';
}

function applyLevel(level: 'moderate' | 'high' | 'critical'): void {
  state.lastEventAt = Date.now();

  if (level === 'critical') {
    state.level = 'minimal';
    document.documentElement.setAttribute('data-motion-degraded', 'minimal');
    FrameGovernor.pause('memory-critical');
  } else if (level === 'high') {
    state.level = 'reduced';
    document.documentElement.setAttribute('data-motion-degraded', 'reduced');
    // Resume in case we were previously paused critical and are now relaxing.
    FrameGovernor.resume();
  } else {
    state.level = 'reduced';
    document.documentElement.setAttribute('data-motion-degraded', 'reduced');
    FrameGovernor.resume();
  }
}

function relax(): void {
  if (state.level === 'none') return;
  state.level = 'none';
  document.documentElement.removeAttribute('data-motion-degraded');
  FrameGovernor.resume();
}

export function installMemoryPressureBridge(): void {
  if (installed) return;
  installed = true;

  const electron = (window as unknown as {
    electron?: { on?: (channel: string, handler: (...args: any[]) => void) => void };
  }).electron;

  const handler = (payload: { level: 'moderate' | 'high' | 'critical'; heapUsedMB: number }) => {
    if (!payload || typeof payload.level !== 'string') return;
    applyLevel(payload.level);
    try {
      dexBus.emit('memory:pressure', { level: payload.level, heapUsedMB: payload.heapUsedMB });
    } catch { /* bus may not be ready in tests */ }

    // Auto-relax after 60s without further pressure events. Cancel any
    // pending timer so only one ever queues at a time.
    if (state.relaxTimer !== null) clearTimeout(state.relaxTimer);
    const seenAt = state.lastEventAt;
    state.relaxTimer = setTimeout(() => {
      state.relaxTimer = null;
      if (state.lastEventAt === seenAt) relax();
    }, 60_000);
  };

  // preload bridge: window.electron.on (renderer-safe, contextIsolated)
  if (electron?.on) {
    electron.on('memory:pressure', handler);
  } else if (typeof (window as any).require === 'function') {
    // Fallback for non-isolated contexts (legacy builds only).
    try {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer?.on('memory:pressure', (_evt: unknown, payload: any) => handler(payload));
    } catch { /* ignore */ }
  }
}

// Auto-install on import.
installMemoryPressureBridge();

export default installMemoryPressureBridge;
