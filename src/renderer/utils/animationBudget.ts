// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Phase 30: Animation Budget System
// System-wide animation control with performance awareness
// ===========================================================================
//
// DEPRECATED as a standalone implementation (DEX Consolidation Audit, finding
// 4). The animation-budget engine now lives in
// services/UnifiedMotionSystem.ts as the single source of truth. This file is
// a thin delegation shim: the budget engine is re-exported below so existing
// importers (performanceIndex.ts and anything it re-exports to) keep working
// unchanged. The hardware PerformanceTier detection, memory-pressure, and idle
// helpers remain here -- they are capability detection, not motion, and have no
// equivalent in the motion system.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Animation budget engine -- re-exported from the unified motion system.
// `useBudgetTransition` is surfaced under its original public name
// `useTransition` to preserve the import contract.
// ---------------------------------------------------------------------------
export {
  ANIMATION_CONFIG,
  initAnimationBudget,
  areAnimationsEnabled,
  getPerformanceMode,
  setAnimationsEnabled,
  getAnimationDuration,
  getEasing,
  getTransition,
  getAnimationStyle,
  getAnimationCSSVariables,
  animationClasses,
  useAnimationDuration,
  useAnimationsEnabled,
  useBudgetTransition as useTransition,
} from '../services/UnifiedMotionSystem';

// Internal use: shouldSkipExpensiveEffect (below) consults the live budget mode.
import { getPerformanceMode } from '../services/UnifiedMotionSystem';
import { useState } from 'react';

// -----------------------------------------------------------------------------
// PERFORMANCE TIER DETECTION (Phase 10: Low-End PC Optimization)
// -----------------------------------------------------------------------------

export type PerformanceTier = 'low' | 'mid' | 'high' | 'ultra';

interface HardwareProfile {
  cores: number;
  memory: number; // GB
  gpu: string;
  tier: PerformanceTier;
}

let cachedTier: PerformanceTier | null = null;
let cachedProfile: HardwareProfile | null = null;

/**
 * Detect hardware capabilities and return a performance tier.
 * Results are cached after first detection.
 */
export function detectPerformanceTier(): PerformanceTier {
  if (cachedTier) return cachedTier;

  // TierManager owns the root perf-tier attribute and may apply a persisted
  // user/manual tier before this module runs. Never overwrite it.
  const rootTier = document.documentElement.getAttribute('data-perf-tier');
  if (rootTier === 'low' || rootTier === 'mid' || rootTier === 'high' || rootTier === 'ultra') {
    cachedTier = rootTier;
    return cachedTier;
  }

  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as any).deviceMemory || 4; // GB, Chrome-only
  let gpu = 'unknown';
  const isLikelyJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
  if (!isLikelyJsdom) {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const dbg = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (dbg) gpu = (gl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'unknown';
      }
    } catch {
      gpu = 'unknown';
    }
  }

  let score = 0;
  // CPU score (0-3)
  if (cores >= 8) score += 3;
  else if (cores >= 4) score += 2;
  else score += 1;
  // Memory score (0-3)
  if (memory >= 16) score += 3;
  else if (memory >= 8) score += 2;
  else score += 1;
  // GPU score (0-3) - penalize integrated/software renderers
  const gpuLower = gpu.toLowerCase();
  if (gpuLower.includes('swiftshader') || gpuLower.includes('llvmpipe') || gpuLower.includes('software')) score += 0;
  else if (gpuLower.includes('intel') || gpuLower.includes('integrated')) score += 1;
  else score += 3;

  const tier: PerformanceTier = score <= 3 ? 'low' : score <= 5 ? 'mid' : score <= 7 ? 'high' : 'ultra';

  cachedProfile = { cores, memory, gpu, tier };
  cachedTier = tier;

  // Only set the attribute as a fallback for environments that did not run
  // TierManager. In the normal app path, TierManager already set this.
  if (!document.documentElement.hasAttribute('data-perf-tier')) {
    document.documentElement.dataset.perfTier = tier;
  }

  return tier;
}

/**
 * Get the full hardware profile (call after detectPerformanceTier)
 */
export function getHardwareProfile(): HardwareProfile | null {
  return cachedProfile;
}

/**
 * Check if backdrop-filter should be used (disabled on low-end)
 */
export function shouldUseBackdropFilter(): boolean {
  const tier = cachedTier || detectPerformanceTier();
  return tier !== 'low';
}

/**
 * Get recommended waveform downsampling factor
 */
export function getWaveformDownsample(): number {
  const tier = cachedTier || detectPerformanceTier();
  return tier === 'low' ? 4 : tier === 'mid' ? 2 : 1;
}

/**
 * Get recommended UI update throttle (ms) during playback
 */
export function getPlaybackThrottle(): number {
  const tier = cachedTier || detectPerformanceTier();
  return tier === 'low' ? 66 : tier === 'mid' ? 33 : 16; // ~15fps, ~30fps, ~60fps
}

/**
 * Hook to get current performance tier
 */
export function usePerformanceTier(): PerformanceTier {
  const [tier] = useState(() => detectPerformanceTier());
  return tier;
}

// -----------------------------------------------------------------------------
// K3 — GPU-aware expensive-effect skip gate
// -----------------------------------------------------------------------------
// Combines the animationBudget frame-time pressure signal with the
// SystemTier hardware classification to produce a single boolean that
// indicates whether a costly visual effect (layered blur, particle system,
// real-time shadow etc.) should be skipped entirely for this frame cycle.
//
// Rules:
//   - PerformanceTier 'low'  → always skip
//   - performanceMode 'disabled' → always skip
//   - performanceMode 'reduced' + tier not 'ultra' → skip
//   - Otherwise → allow
// -----------------------------------------------------------------------------

/**
 * Returns true when expensive visual effects (blur layers, particle systems,
 * real-time shadows, convolution filters) should be skipped based on the
 * current hardware tier and live frame-time pressure.
 *
 * Callers should gate their expensive work behind this:
 * ```ts
 * if (!shouldSkipExpensiveEffect()) {
 *   renderParticles();
 * }
 * ```
 */
export function shouldSkipExpensiveEffect(): boolean {
  const tier = cachedTier ?? detectPerformanceTier();
  if (tier === 'low') return true;
  const mode = getPerformanceMode();
  if (mode === 'disabled') return true;
  if (mode === 'reduced' && tier !== 'ultra') return true;
  return false;
}

/**
 * Schedule a non-critical callback via requestIdleCallback (falls back to setTimeout)
 */
export function scheduleIdle(cb: () => void, timeout = 2000): number {
  if ('requestIdleCallback' in window) {
    return (window as any).requestIdleCallback(cb, { timeout });
  }
  return setTimeout(cb, 100) as unknown as number;
}

/**
 * Cancel a scheduled idle callback
 */
export function cancelIdle(id: number): void {
  if ('cancelIdleCallback' in window) {
    (window as any).cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

// -----------------------------------------------------------------------------
// MEMORY PRESSURE DETECTION
// -----------------------------------------------------------------------------

let memoryWarnTriggered = false;

/**
 * Check if memory usage is high and reduce caches if needed.
 * Returns true if memory is under pressure.
 */
export function checkMemoryPressure(): boolean {
  const perf = performance as any;
  if (!perf.memory) return false;
  const used = perf.memory.usedJSHeapSize;
  const limit = perf.memory.jsHeapSizeLimit;
  const ratio = used / limit;
  if (ratio > 0.85 && !memoryWarnTriggered) {
    memoryWarnTriggered = true;
    console.warn(`[DEX] Memory pressure: ${(ratio * 100).toFixed(1)}% heap used (${(used / 1024 / 1024).toFixed(0)}MB / ${(limit / 1024 / 1024).toFixed(0)}MB)`);
  } else if (ratio < 0.7) {
    memoryWarnTriggered = false;
  }
  return ratio > 0.85;
}
