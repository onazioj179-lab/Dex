// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Animation Timing Tokens
 * 
 * Unified timing constants for consistent motion across the app.
 * All durations in milliseconds, all easings in CSS format.
 * 
 * Guidelines:
 * - micro: hover states, button presses (instant feedback)
 * - fast: tooltips, dropdowns, small UI changes
 * - normal: modals, sidebars, panels
 * - slow: page transitions, onboarding
 * - slower: complex animations, emphasis
 */

// ---------------------------------------------------------------------------
// Duration Tokens (milliseconds)
// ---------------------------------------------------------------------------

export const DURATION = {
  /** Instant feedback: hovers, active states (50ms) */
  micro: 50,
  
  /** Quick interactions: tooltips, small changes (100ms) */
  fast: 100,
  
  /** Standard UI transitions (150ms) */
  normal: 150,
  
  /** Modal/panel animations (200ms) */
  medium: 200,
  
  /** Page transitions, sidebars (250ms) */
  slow: 250,
  
  /** Complex/emphasized animations (300ms) */
  slower: 300,
  
  /** Dramatic reveals, onboarding (400ms) */
  dramatic: 400,
  
  /** Very slow, cinematic (500ms) */
  glacial: 500,
} as const;

// ---------------------------------------------------------------------------
// Easing Tokens (CSS timing functions)
// ---------------------------------------------------------------------------

export const EASING = {
  /** Linear movement (no acceleration) */
  linear: 'linear',
  
  /** Standard ease for general use */
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  
  /** Ease in: slow start, fast end (entering content) */
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  
  /** Ease out: fast start, slow end (exiting content, settling) */
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  
  /** Ease in-out: slow start and end */
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  
  /** Spring-like overshoot */
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  
  /** Bounce effect */
  bounce: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
  
  /** Sharp acceleration */
  sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
  
  /** Smooth deceleration for natural feel */
  smooth: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  
  /** macOS-inspired ease */
  macos: 'cubic-bezier(0.2, 0, 0, 1)',
  
  /** Emphasized entrance */
  emphasizedIn: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  
  /** Emphasized exit */
  emphasizedOut: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
} as const;

// ---------------------------------------------------------------------------
// CSS Transition Presets
// ---------------------------------------------------------------------------

export const TRANSITION = {
  /** Hover states, button feedback */
  micro: `${DURATION.micro}ms ${EASING.out}`,
  
  /** Tooltip, dropdown appearance */
  fast: `${DURATION.fast}ms ${EASING.out}`,
  
  /** Standard UI changes */
  normal: `${DURATION.normal}ms ${EASING.default}`,
  
  /** Modal/panel open/close */
  medium: `${DURATION.medium}ms ${EASING.macos}`,
  
  /** Sidebar collapse/expand */
  slow: `${DURATION.slow}ms ${EASING.inOut}`,
  
  /** Page transitions */
  page: `${DURATION.slower}ms ${EASING.emphasizedIn}`,
  
  /** Color/opacity only (no layout) */
  color: `color ${DURATION.fast}ms ${EASING.out}, background-color ${DURATION.fast}ms ${EASING.out}, opacity ${DURATION.fast}ms ${EASING.out}`,
  
  /** Transform only (GPU accelerated) */
  transform: `transform ${DURATION.normal}ms ${EASING.out}`,
  
  /** All properties */
  all: `all ${DURATION.normal}ms ${EASING.default}`,
  
  /** None (instant) */
  none: 'none',
} as const;

// ---------------------------------------------------------------------------
// Property-Specific Transitions
// ---------------------------------------------------------------------------

export const createTransition = (
  properties: string[],
  duration: keyof typeof DURATION = 'normal',
  easing: keyof typeof EASING = 'default'
): string => {
  return properties
    .map(prop => `${prop} ${DURATION[duration]}ms ${EASING[easing]}`)
    .join(', ');
};

// ---------------------------------------------------------------------------
// Animation Keyframe Helpers
// ---------------------------------------------------------------------------

export const KEYFRAMES = {
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  
  fadeOut: {
    from: { opacity: 1 },
    to: { opacity: 0 },
  },
  
  slideInFromTop: {
    from: { transform: 'translateY(-100%)', opacity: 0 },
    to: { transform: 'translateY(0)', opacity: 1 },
  },
  
  slideInFromBottom: {
    from: { transform: 'translateY(100%)', opacity: 0 },
    to: { transform: 'translateY(0)', opacity: 1 },
  },
  
  slideInFromLeft: {
    from: { transform: 'translateX(-100%)', opacity: 0 },
    to: { transform: 'translateX(0)', opacity: 1 },
  },
  
  slideInFromRight: {
    from: { transform: 'translateX(100%)', opacity: 0 },
    to: { transform: 'translateX(0)', opacity: 1 },
  },
  
  scaleIn: {
    from: { transform: 'scale(0.9)', opacity: 0 },
    to: { transform: 'scale(1)', opacity: 1 },
  },
  
  scaleOut: {
    from: { transform: 'scale(1)', opacity: 1 },
    to: { transform: 'scale(0.9)', opacity: 0 },
  },
  
  pulse: {
    '0%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.05)' },
    '100%': { transform: 'scale(1)' },
  },
  
  shake: {
    '0%, 100%': { transform: 'translateX(0)' },
    '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
    '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
  },
  
  spin: {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
} as const;

// ---------------------------------------------------------------------------
// Reduce Motion Support
// ---------------------------------------------------------------------------

let reduceMotion = false;

export const initReduceMotionCheck = () => {
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = mediaQuery.matches;
    
    mediaQuery.addEventListener('change', (e) => {
      reduceMotion = e.matches;
    });
  }
};

export const isReducedMotion = (): boolean => reduceMotion;

export const getReducedDuration = (duration: number): number => {
  return reduceMotion ? Math.min(duration, 50) : duration;
};

export const getReducedTransition = (transition: string): string => {
  if (reduceMotion) {
    return transition.replace(/\d+ms/g, '0ms');
  }
  return transition;
};

// ---------------------------------------------------------------------------
// Animation Utilities
// ---------------------------------------------------------------------------

/**
 * Creates a staggered delay for list animations
 * @param index Item index in list
 * @param baseDelay Base delay before first item
 * @param staggerDelay Delay between items
 */
export const staggerDelay = (
  index: number,
  baseDelay = 0,
  staggerDelay = 30
): number => {
  return baseDelay + index * staggerDelay;
};

/**
 * Creates CSS for a staggered animation
 */
export const staggerStyle = (
  index: number,
  baseDelay = 0,
  stagger = 30
): React.CSSProperties => ({
  animationDelay: `${staggerDelay(index, baseDelay, stagger)}ms`,
});

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

export type DurationKey = keyof typeof DURATION;
export type EasingKey = keyof typeof EASING;
export type TransitionKey = keyof typeof TRANSITION;
export type KeyframeKey = keyof typeof KEYFRAMES;

// Initialize on load
if (typeof window !== 'undefined') {
  initReduceMotionCheck();
}

export default {
  DURATION,
  EASING,
  TRANSITION,
  KEYFRAMES,
  createTransition,
  staggerDelay,
  staggerStyle,
  isReducedMotion,
  getReducedDuration,
  getReducedTransition,
};
