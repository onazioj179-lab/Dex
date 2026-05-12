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

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------

export const ANIMATION_CONFIG = {
  // Base durations (in ms) - these are modified by system state
  micro: 20,      // Subtle feedback (hover, press)
  fast: 50,       // Quick transitions (dropdown open)
  normal: 80,     // Standard transitions (panel slide)
  slow: 120,      // Emphasis transitions (modal)
  
  // Easing functions
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',      // Material standard
    decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)', // Entry
    accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',   // Exit
    sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',        // Sharp movement
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)', // Bouncy
  },
  
  // Frame budget (ms) - disable animations if frame time exceeds this
  frameBudgetThreshold: 32, // ~30fps - below this we reduce animations
  
  // Minimum animation (ms) - anything shorter is instant
  minimumDuration: 16,
} as const;

// -----------------------------------------------------------------------------
// ANIMATION STATE
// -----------------------------------------------------------------------------

interface AnimationState {
  enabled: boolean;
  reducedMotion: boolean;
  performanceMode: 'normal' | 'reduced' | 'disabled';
  lastFrameTime: number;
  frameTimeHistory: number[];
}

const state: AnimationState = {
  enabled: true,
  reducedMotion: false,
  performanceMode: 'normal',
  lastFrameTime: 16,
  frameTimeHistory: [],
};

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------

let initialized = false;
let frameId: number | null = null;

/**
 * Initialize animation budget system
 * Call once at app startup
 */
export function initAnimationBudget(): () => void {
  if (initialized) {
    return () => {};
  }
  
  initialized = true;
  
  // Check reduced motion preference
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  state.reducedMotion = mediaQuery.matches;
  
  const handleMotionChange = (e: MediaQueryListEvent) => {
    state.reducedMotion = e.matches;
    updatePerformanceMode();
  };
  
  mediaQuery.addEventListener('change', handleMotionChange);
  
  // Monitor frame timing - sample periodically (every 500ms) instead of
  // running a continuous rAF loop which wastes CPU when idle.
  let lastTime = performance.now();
  let sampleTimer: ReturnType<typeof setTimeout> | null = null;
  
  const measureFrame = (time: number) => {
    const frameTime = time - lastTime;
    lastTime = time;
    
    // Update frame time history (keep last 10 samples)
    state.frameTimeHistory.push(frameTime);
    if (state.frameTimeHistory.length > 10) {
      state.frameTimeHistory.shift();
    }
    
    state.lastFrameTime = frameTime;
    
    // Update performance mode based on frame times
    updatePerformanceMode();
  };
  
  const scheduleSample = () => {
    sampleTimer = setTimeout(() => {
      frameId = requestAnimationFrame((time) => {
        measureFrame(time);
        scheduleSample();
      });
    }, 3000);
  };
  
  // Kick off the first sample
  frameId = requestAnimationFrame((time) => {
    lastTime = time;
    scheduleSample();
  });
  
  // Cleanup function
  return () => {
    mediaQuery.removeEventListener('change', handleMotionChange);
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (sampleTimer !== null) {
      clearTimeout(sampleTimer);
      sampleTimer = null;
    }
    initialized = false;
  };
}

/**
 * Update performance mode based on current state
 */
function updatePerformanceMode(): void {
  if (state.reducedMotion) {
    state.performanceMode = 'disabled';
    return;
  }
  
  // Calculate average frame time
  if (state.frameTimeHistory.length < 10) {
    state.performanceMode = 'normal';
    return;
  }
  
  const avgFrameTime = state.frameTimeHistory.reduce((a, b) => a + b, 0) / state.frameTimeHistory.length;
  
  if (avgFrameTime > ANIMATION_CONFIG.frameBudgetThreshold * 2) {
    // Very poor performance - disable animations
    state.performanceMode = 'disabled';
  } else if (avgFrameTime > ANIMATION_CONFIG.frameBudgetThreshold) {
    // Poor performance - reduce animations
    state.performanceMode = 'reduced';
  } else {
    state.performanceMode = 'normal';
  }
}

// -----------------------------------------------------------------------------
// API
// -----------------------------------------------------------------------------

/**
 * Check if animations are currently enabled
 */
export function areAnimationsEnabled(): boolean {
  return state.enabled && state.performanceMode !== 'disabled';
}

/**
 * Get current performance mode
 */
export function getPerformanceMode(): AnimationState['performanceMode'] {
  return state.performanceMode;
}

/**
 * Manually enable/disable animations
 */
export function setAnimationsEnabled(enabled: boolean): void {
  state.enabled = enabled;
}

/**
 * Get animation duration adjusted for current state
 */
export function getAnimationDuration(
  type: 'micro' | 'fast' | 'normal' | 'slow' | number
): number {
  const baseDuration = typeof type === 'number' 
    ? type 
    : ANIMATION_CONFIG[type];
  
  if (state.reducedMotion || !state.enabled) {
    return 0;
  }
  
  switch (state.performanceMode) {
    case 'disabled':
      return 0;
    case 'reduced':
      // Halve the duration when performance is poor
      return Math.max(ANIMATION_CONFIG.minimumDuration, baseDuration * 0.5);
    default:
      return baseDuration;
  }
}

/**
 * Get easing function for current state
 */
export function getEasing(
  type: keyof typeof ANIMATION_CONFIG.easing = 'default'
): string {
  if (!areAnimationsEnabled()) {
    return 'linear';
  }
  
  if (state.performanceMode === 'reduced') {
    // Use simpler easing when reducing animations
    return 'ease-out';
  }
  
  return ANIMATION_CONFIG.easing[type];
}

/**
 * Get complete transition string
 */
export function getTransition(
  properties: string | string[],
  duration: 'micro' | 'fast' | 'normal' | 'slow' | number = 'fast',
  easing: keyof typeof ANIMATION_CONFIG.easing = 'default'
): string {
  const d = getAnimationDuration(duration);
  const e = getEasing(easing);
  
  if (d === 0) {
    return 'none';
  }
  
  const props = Array.isArray(properties) ? properties : [properties];
  return props.map(prop => `${prop} ${d}ms ${e}`).join(', ');
}

/**
 * Get animation CSS object for React inline styles
 */
export function getAnimationStyle(
  duration: 'micro' | 'fast' | 'normal' | 'slow' | number = 'fast',
  easing: keyof typeof ANIMATION_CONFIG.easing = 'default'
): React.CSSProperties {
  const d = getAnimationDuration(duration);
  
  if (d === 0) {
    return { transition: 'none' };
  }
  
  return {
    transitionDuration: `${d}ms`,
    transitionTimingFunction: getEasing(easing),
  };
}

// -----------------------------------------------------------------------------
// CSS VARIABLE GENERATION
// -----------------------------------------------------------------------------

/**
 * Generate CSS variables for animation system
 * Call this to get CSS that can be injected into :root
 */
export function getAnimationCSSVariables(): string {
  const micro = getAnimationDuration('micro');
  const fast = getAnimationDuration('fast');
  const normal = getAnimationDuration('normal');
  const slow = getAnimationDuration('slow');
  const easing = getEasing('default');
  
  return `
    --animation-micro: ${micro}ms;
    --animation-fast: ${fast}ms;
    --animation-normal: ${normal}ms;
    --animation-slow: ${slow}ms;
    --animation-easing: ${easing};
    --animation-enabled: ${areAnimationsEnabled() ? '1' : '0'};
  `;
}

/**
 * CSS helper classes for common animations
 */
export const animationClasses = `
/* Animation utility classes */
.animate-fade-in {
  animation: fadeIn var(--animation-fast) var(--animation-easing);
}

.animate-fade-out {
  animation: fadeOut var(--animation-fast) var(--animation-easing);
}

.animate-slide-up {
  animation: slideUp var(--animation-normal) var(--animation-easing);
}

.animate-slide-down {
  animation: slideDown var(--animation-normal) var(--animation-easing);
}

.animate-scale-in {
  animation: scaleIn var(--animation-fast) cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.animate-scale-out {
  animation: scaleOut var(--animation-fast) var(--animation-easing);
}

/* Transition utilities */
.transition-fast {
  transition: all var(--animation-fast) var(--animation-easing);
}

.transition-normal {
  transition: all var(--animation-normal) var(--animation-easing);
}

.transition-colors {
  transition: color var(--animation-fast) var(--animation-easing),
              background-color var(--animation-fast) var(--animation-easing),
              border-color var(--animation-fast) var(--animation-easing);
}

.transition-transform {
  transition: transform var(--animation-fast) var(--animation-easing);
}

.transition-opacity {
  transition: opacity var(--animation-fast) var(--animation-easing);
}

/* Keyframe definitions */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(8px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideDown {
  from { 
    opacity: 0;
    transform: translateY(-8px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from { 
    opacity: 0;
    transform: scale(0.95);
  }
  to { 
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes scaleOut {
  from { 
    opacity: 1;
    transform: scale(1);
  }
  to { 
    opacity: 0;
    transform: scale(0.95);
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

// -----------------------------------------------------------------------------
// REACT HOOKS
// -----------------------------------------------------------------------------

import { useState, useEffect } from 'react';

/**
 * Hook to get current animation duration for a type
 */
export function useAnimationDuration(
  type: 'micro' | 'fast' | 'normal' | 'slow' | number = 'normal'
): number {
  const [duration, setDuration] = useState(() => getAnimationDuration(type));
  
  useEffect(() => {
    // Update when reduced motion preference changes
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const update = () => setDuration(getAnimationDuration(type));
    
    mediaQuery.addEventListener('change', update);
    
    // Check on perf-tier changes (no polling -- event-driven only)
    const tierObs = new MutationObserver(() => setDuration(getAnimationDuration(type)));
    tierObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-perf-tier'] });
    
    return () => {
      mediaQuery.removeEventListener('change', update);
      tierObs.disconnect();
    };
  }, [type]);
  
  return duration;
}

/**
 * Hook to check if animations are enabled
 */
export function useAnimationsEnabled(): boolean {
  const [enabled, setEnabled] = useState(areAnimationsEnabled);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const update = () => setEnabled(areAnimationsEnabled());
    
    mediaQuery.addEventListener('change', update);
    const tierObs = new MutationObserver(update);
    tierObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-perf-tier'] });
    
    return () => {
      mediaQuery.removeEventListener('change', update);
      tierObs.disconnect();
    };
  }, []);
  
  return enabled;
}

/**
 * Hook to get transition style
 */
export function useTransition(
  properties: string | string[],
  duration: 'micro' | 'fast' | 'normal' | 'slow' | number = 'fast'
): string {
  const d = useAnimationDuration(typeof duration === 'number' ? duration : ANIMATION_CONFIG[duration]);
  
  if (d === 0) return 'none';
  
  const props = Array.isArray(properties) ? properties : [properties];
  const easing = getEasing('default');
  
  return props.map(prop => `${prop} ${d}ms ${easing}`).join(', ');
}

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
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  let gpu = 'unknown';
  if (gl) {
    const dbg = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (dbg) gpu = (gl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'unknown';
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
