// ═══════════════════════════════════════════════════════════════════════════
// DEX - Phase 30: Animation Budget System
// System-wide animation control with performance awareness
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export const ANIMATION_CONFIG = {
  // Base durations (in ms) - these are modified by system state
  micro: 50,      // Subtle feedback (hover, press)
  fast: 100,      // Quick transitions (dropdown open)
  normal: 150,    // Standard transitions (panel slide)
  slow: 250,      // Emphasis transitions (modal)
  
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

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATION STATE
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

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
  
  // Monitor frame timing
  let lastTime = performance.now();
  
  const measureFrame = (time: number) => {
    const frameTime = time - lastTime;
    lastTime = time;
    
    // Update frame time history (keep last 30 frames)
    state.frameTimeHistory.push(frameTime);
    if (state.frameTimeHistory.length > 30) {
      state.frameTimeHistory.shift();
    }
    
    state.lastFrameTime = frameTime;
    
    // Update performance mode based on frame times
    updatePerformanceMode();
    
    frameId = requestAnimationFrame(measureFrame);
  };
  
  frameId = requestAnimationFrame(measureFrame);
  
  // Cleanup function
  return () => {
    mediaQuery.removeEventListener('change', handleMotionChange);
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
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

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// CSS VARIABLE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// REACT HOOKS
// ─────────────────────────────────────────────────────────────────────────────

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
    
    // Also update periodically to catch performance changes
    const interval = setInterval(update, 1000);
    
    return () => {
      mediaQuery.removeEventListener('change', update);
      clearInterval(interval);
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
    const interval = setInterval(update, 1000);
    
    return () => {
      mediaQuery.removeEventListener('change', update);
      clearInterval(interval);
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
