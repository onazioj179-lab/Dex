// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// ThermalAdaptiveMonitor
// ----------------------------------------------------------------------------
// Renderer-side adaptive performance guardrail. Combines:
//   1. Main-process thermal/power signals (already pushed via PerformanceOptimization)
//   2. Real-time frame budget sampling (rAF jank detection)
//   3. Long-task observer (LongTask API)
//
// Every 10 s it samples one ~1 s burst of frames (visible windows only). When a
// burst's median frame time is slow (> 22ms) we downshift the document
// `data-thermal-state` attribute to "warm" / "hot", which CSS uses to disable
// non-essential effects (heavy blur, particles, background animations). After
// three clean bursts (~30 s) we step back up.
//
// Pure renderer module. No main IPC required to start working.
// =============================================================================

import { usePerformanceOptimization } from './PerformanceOptimization';

type ThermalLevel = 'cool' | 'warm' | 'hot' | 'critical';

const SAMPLE_WINDOW = 60;          // one burst: ~1s at 60fps
const BURST_EVERY_MS = 10_000;     // sample one burst every 10 s, not every frame
const RECOVERY_BURSTS = 3;         // ~30 s of clean bursts before stepping back up
const TARGET_FRAME_MS = 16.7;
const WARM_THRESHOLD_MS = 22;      // sustained > 22ms median = warm
const HOT_THRESHOLD_MS = 33;       // sustained > 33ms median = hot (sub-30fps)
const CRITICAL_THRESHOLD_MS = 50;  // sub-20fps = critical

let started = false;
let currentLevel: ThermalLevel = 'cool';
let frameTimes: number[] = [];
let lastFrameTs = 0;
let cleanBursts = 0;
let rafHandle = 0;
let burstTimer: ReturnType<typeof setInterval> | null = null;
let longTasksInWindow = 0;
// Long-task observer is created lazily in start() and torn down in stop() so a
// start/stop/start cycle doesn't leak duplicates.
let longTaskObserver: PerformanceObserver | null = null;
// Main-process thermal IPC listener: kept with its emitter so stop() can remove
// it -- otherwise a start/stop/start cycle stacks duplicate listeners (leak).
let thermalIpc: { off?: Function; removeListener?: Function } | null = null;
let thermalIpcHandler: ((...args: any[]) => void) | null = null;

function setLevel(next: ThermalLevel, reason: string): void {
  if (next === currentLevel) return;
  currentLevel = next;
  document.documentElement.setAttribute('data-thermal-state', next);
  // Reflect into perf store so apps can react (animationScale, particleScale)
  const scale = next === 'cool' ? 1 : next === 'warm' ? 0.7 : next === 'hot' ? 0.4 : 0.2;
  usePerformanceOptimization.getState().setThermalState({
    state: next,
    animationScale: scale,
    gameFrameCap: next === 'cool' ? 0 : next === 'warm' ? 60 : next === 'hot' ? 45 : 30,
    gameResolutionStep: next === 'cool' ? 0 : next === 'warm' ? 1 : next === 'hot' ? 2 : 3,
    writeCoalesceMs: next === 'cool' ? 100 : next === 'warm' ? 200 : 400,
  });
  // Surface as a debug event for telemetry / diagnostics overlays
  try {
    window.dispatchEvent(new CustomEvent('dex:thermal-adapt', { detail: { level: next, reason } }));
  } catch { /* */ }
}

/** Level for one burst's median frame time (pure; exported for tests). */
export function classifyBurst(median: number, longTasks: number, current: ThermalLevel, clean: number): { level: ThermalLevel; clean: number } {
  if (median >= CRITICAL_THRESHOLD_MS) return { level: 'critical', clean: 0 };
  if (median >= HOT_THRESHOLD_MS) return { level: 'hot', clean: 0 };
  if (median >= WARM_THRESHOLD_MS || longTasks >= 4) return { level: 'warm', clean: 0 };
  if (median <= TARGET_FRAME_MS + 2) {
    // Only step back down after sustained recovery.
    const next = clean + 1;
    return next >= RECOVERY_BURSTS ? { level: 'cool', clean: 0 } : { level: current, clean: next };
  }
  return { level: current, clean };
}

// Frame sampling runs in short bursts instead of a perpetual rAF loop: a loop
// that never stops keeps the renderer waking at display refresh rate forever,
// even when nothing on screen changes. Hidden windows are skipped because the
// browser throttles their frames, which used to read as "critical" jank and
// degrade the UI after the window was minimized.
function tick(now: number): void {
  rafHandle = 0;
  if (document.hidden) return;
  if (lastFrameTs > 0) frameTimes.push(now - lastFrameTs);
  lastFrameTs = now;
  if (frameTimes.length < SAMPLE_WINDOW) {
    rafHandle = requestAnimationFrame(tick);
    return;
  }
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const r = classifyBurst(median, longTasksInWindow, currentLevel, cleanBursts);
  cleanBursts = r.clean;
  setLevel(r.level, `median=${median.toFixed(1)}ms longTasks=${longTasksInWindow}`);
  // Old jank fades: each burst forgets the long tasks seen before it.
  longTasksInWindow = 0;
}

function startBurst(): void {
  if (rafHandle || document.hidden) return;
  frameTimes = [];
  lastFrameTs = 0;
  rafHandle = requestAnimationFrame(tick);
}

export function startThermalAdaptiveMonitor(): void {
  if (started) return;
  started = true;
  document.documentElement.setAttribute('data-thermal-state', 'cool');

  // Long-task observer (Chromium): tasks > 50ms count as jank pressure
  try {
    if ('PerformanceObserver' in window) {
      const obs = new PerformanceObserver((list) => {
        longTasksInWindow += list.getEntries().length;
      });
      try { obs.observe({ entryTypes: ['longtask'] }); } catch { /* not supported */ }
      longTaskObserver = obs;
    }
  } catch { /* */ }

  // Main-process thermal events override renderer detection
  try {
    const w = window as any;
    const ipc = w.electron || w.api;
    if (ipc && typeof ipc.on === 'function') {
      const handler = (_: any, state: { state: ThermalLevel }) => {
        if (state && state.state) setLevel(state.state, 'main-process');
      };
      ipc.on('dex:thermal-state', handler);
      thermalIpc = ipc;
      thermalIpcHandler = handler;
    }
  } catch { /* */ }

  burstTimer = setInterval(startBurst, BURST_EVERY_MS);
  startBurst();
}

export function stopThermalAdaptiveMonitor(): void {
  if (!started) return;
  started = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  rafHandle = 0;
  if (burstTimer) { clearInterval(burstTimer); burstTimer = null; }
  if (longTaskObserver) { longTaskObserver.disconnect(); longTaskObserver = null; }
  if (thermalIpc && thermalIpcHandler) {
    try { (thermalIpc.off ?? thermalIpc.removeListener)?.call(thermalIpc, 'dex:thermal-state', thermalIpcHandler); } catch { /* */ }
  }
  thermalIpc = null;
  thermalIpcHandler = null;
  frameTimes = [];
  lastFrameTs = 0;
  cleanBursts = 0;
}

export function getThermalLevel(): ThermalLevel {
  return currentLevel;
}
