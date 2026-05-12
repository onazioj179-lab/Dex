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
// When sustained jank is detected (mean frame > 22ms over 60 samples) we
// downshift the document `data-thermal-state` attribute to "warm" / "hot"
// which CSS uses to disable non-essential effects (heavy blur, particles,
// background animations). When frames recover for 5s we step back up.
//
// Pure renderer module. No main IPC required to start working.
// =============================================================================

import { usePerformanceOptimization } from './PerformanceOptimization';

type ThermalLevel = 'cool' | 'warm' | 'hot' | 'critical';

const SAMPLE_WINDOW = 60;          // ~1s at 60fps
const RECOVERY_FRAMES = 300;       // ~5s of clean frames before stepping back up
const TARGET_FRAME_MS = 16.7;
const WARM_THRESHOLD_MS = 22;      // sustained > 22ms mean = warm
const HOT_THRESHOLD_MS = 33;       // sustained > 33ms mean = hot (sub-30fps)
const CRITICAL_THRESHOLD_MS = 50;  // sub-20fps = critical

let started = false;
let currentLevel: ThermalLevel = 'cool';
let frameTimes: number[] = [];
let lastFrameTs = 0;
let cleanFrameCount = 0;
let rafHandle = 0;
let longTasksInWindow = 0;

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

function tick(now: number): void {
  if (lastFrameTs > 0) {
    const dt = now - lastFrameTs;
    frameTimes.push(dt);
    if (frameTimes.length > SAMPLE_WINDOW) frameTimes.shift();

    if (frameTimes.length >= SAMPLE_WINDOW) {
      // Use median rather than mean to ignore one-off spikes
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      let next: ThermalLevel = currentLevel;
      if (median >= CRITICAL_THRESHOLD_MS) next = 'critical';
      else if (median >= HOT_THRESHOLD_MS) next = 'hot';
      else if (median >= WARM_THRESHOLD_MS || longTasksInWindow >= 4) next = 'warm';
      else if (median <= TARGET_FRAME_MS + 2) {
        // Only step back down after sustained recovery
        cleanFrameCount++;
        if (cleanFrameCount >= RECOVERY_FRAMES) {
          next = 'cool';
          cleanFrameCount = 0;
        }
      }

      if (next !== currentLevel) {
        cleanFrameCount = 0;
        setLevel(next, `median=${median.toFixed(1)}ms longTasks=${longTasksInWindow}`);
      }
    }
  }
  lastFrameTs = now;
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
        // Decay the long-task count on a slow timer so old jank doesn't linger
      });
      try { obs.observe({ entryTypes: ['longtask'] }); } catch { /* not supported */ }
      setInterval(() => { longTasksInWindow = Math.max(0, longTasksInWindow - 1); }, 1500);
    }
  } catch { /* */ }

  // Main-process thermal events override renderer detection
  try {
    const w = window as any;
    const ipc = w.electron || w.api;
    if (ipc && typeof ipc.on === 'function') {
      ipc.on('dex:thermal-state', (_: any, state: { state: ThermalLevel }) => {
        if (state && state.state) setLevel(state.state, 'main-process');
      });
    }
  } catch { /* */ }

  rafHandle = requestAnimationFrame(tick);
}

export function stopThermalAdaptiveMonitor(): void {
  if (!started) return;
  started = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  rafHandle = 0;
  frameTimes = [];
  lastFrameTs = 0;
}

export function getThermalLevel(): ThermalLevel {
  return currentLevel;
}
