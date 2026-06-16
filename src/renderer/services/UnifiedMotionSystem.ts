// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Unified Motion System (Renderer)
// ==========================================================================
// Single motion controller for all renderer animations. Respects
// prefers-reduced-motion, capability tiers, and CPU load thresholds.
// Uses requestAnimationFrame with frame-budget enforcement and
// skip-ahead on dropped frames.
// ==========================================================================

// ---------------------------------------------------------------------------
// Constants (duplicated from main for renderer isolation)
// ---------------------------------------------------------------------------

const MOTION_DURATION = {
  INSTANT: 0,
  MICRO: 80,
  FAST: 120,
  NORMAL: 200,
  SLOW: 320,
  DELIBERATE: 500,
  PAGE_TRANSITION: 250,
  MODAL_ENTER: 200,
  MODAL_EXIT: 150,
  SIDEBAR_TOGGLE: 200,
  DROPDOWN_OPEN: 120,
  DROPDOWN_CLOSE: 100,
  TOOLTIP_ENTER: 150,
  TOOLTIP_EXIT: 100,
  NOTIFICATION_ENTER: 300,
  NOTIFICATION_EXIT: 200,
  TAB_SWITCH: 150,
  LIST_ITEM_ENTER: 80,
  LIST_ITEM_EXIT: 60,
  // DEX Motion Framework categories (mirror of the --motion-* CSS contract in
  // design-system.css; keep the two in sync).
  WINDOW_OPEN: 220,
  WINDOW_CLOSE: 160,
  WINDOW_MINIMIZE: 200,
  WINDOW_RESTORE: 220,
  WINDOW_EXPAND: 240,
  WORKSPACE_SWITCH: 260,
  PROJECT_SWITCH: 300,
  FOCUS_SWITCH: 180,
  DOCK_REVEAL: 200,
  DOCK_HIDE: 160,
  DOCK_LAUNCH: 360,
  DOCK_HOVER: 120,
  DOCK_DRAG: 90,
  PANEL_EXPAND: 200,
  PANEL_COLLAPSE: 160,
  PANEL_REORGANIZE: 240,
} as const;

const MOTION_EASING = {
  LINEAR: 'linear',
  EASE_OUT: 'cubic-bezier(0.0, 0.0, 0.2, 1.0)',
  EASE_IN: 'cubic-bezier(0.4, 0.0, 1.0, 1.0)',
  EASE_IN_OUT: 'cubic-bezier(0.4, 0.0, 0.2, 1.0)',
  DECELERATE: 'cubic-bezier(0.0, 0.0, 0.2, 1.0)',
  ACCELERATE: 'cubic-bezier(0.4, 0.0, 1.0, 1.0)',
  SHARP: 'cubic-bezier(0.4, 0.0, 0.6, 1.0)',
  SPRING: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  TAHOE: 'cubic-bezier(0.23, 1.0, 0.32, 1.0)',
} as const;

const FRAME_BUDGET_MS = 16.67;
const DROPPED_FRAME_SKIP = 3;
const CPU_THROTTLE_PERCENT = 75;
const THROTTLED_MAX_MS = 80;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MotionConfig {
  duration: number;
  easing: string;
  properties: string[];
}

interface AnimationTask {
  id: string;
  element: HTMLElement;
  config: MotionConfig;
  startTime: number;
  onComplete?: () => void;
  cancelled: boolean;
}

type MotionTier = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Unified Motion System
// ---------------------------------------------------------------------------

class UnifiedMotionSystem {
  private tier: MotionTier = 1;
  private prefersReducedMotion = false;
  private activeAnimations = new Map<string, AnimationTask>();
  private frameId: number | null = null;
  private lastFrameTime = 0;
  private droppedFrameCount = 0;
  private totalAnimationsRun = 0;
  private totalAnimationsSkipped = 0;
  private initialized = false;
  private mediaQuery: MediaQueryList | null = null;
  private _animIdCounter = 0;

  initialize(): void {
    if (this.initialized) return;

    // Detect prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.prefersReducedMotion = this.mediaQuery.matches;
      const handler = (e: MediaQueryListEvent) => {
        this.prefersReducedMotion = e.matches;
        if (e.matches) {
          this.tier = 3;
        }
      };
      if (this.mediaQuery.addEventListener) {
        this.mediaQuery.addEventListener('change', handler);
      }
    }

    if (this.prefersReducedMotion) {
      this.tier = 3;
    }

    this.initialized = true;
  }

  // ---------------------------------------------------------------------------
  // Tier management
  // ---------------------------------------------------------------------------

  setTier(tier: MotionTier): void {
    this.tier = tier;
    if (tier === 3) {
      this.cancelAll();
    }
  }

  getTier(): MotionTier {
    return this.tier;
  }

  adjustForCPU(cpuPercent: number): void {
    if (cpuPercent > CPU_THROTTLE_PERCENT) {
      if (this.tier < 2) this.tier = 2;
    } else if (!this.prefersReducedMotion) {
      this.tier = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Animation API
  // ---------------------------------------------------------------------------

  animate(element: HTMLElement, preset: string, onComplete?: () => void): string {
    const config = this.resolvePreset(preset);
    return this.runAnimation(element, config, onComplete);
  }

  animateCustom(element: HTMLElement, config: MotionConfig, onComplete?: () => void): string {
    return this.runAnimation(element, this.applyTier(config), onComplete);
  }

  // CSS transition-based animation (more efficient for simple property changes)
  transition(element: HTMLElement, preset: string): void {
    const config = this.resolvePreset(preset);
    const adjusted = this.applyTier(config);

    if (adjusted.duration === 0) {
      element.style.transition = 'none';
      this.totalAnimationsSkipped++;
      return;
    }

    const transitionValue = adjusted.properties
      .map(prop => `${prop} ${adjusted.duration}ms ${adjusted.easing}`)
      .join(', ');

    element.style.transition = transitionValue;
    this.totalAnimationsRun++;
  }

  // Generate CSS transition string (for inline application without DOM access)
  getTransitionCSS(preset: string): string {
    const config = this.resolvePreset(preset);
    const adjusted = this.applyTier(config);

    if (adjusted.duration === 0) return 'none';

    return adjusted.properties
      .map(prop => `${prop} ${adjusted.duration}ms ${adjusted.easing}`)
      .join(', ');
  }

  // Generate React style object for a transition
  getTransitionStyle(preset: string): React.CSSProperties {
    const config = this.resolvePreset(preset);
    const adjusted = this.applyTier(config);

    if (adjusted.duration === 0) {
      return { transition: 'none' };
    }

    return {
      transition: adjusted.properties
        .map(prop => `${prop} ${adjusted.duration}ms ${adjusted.easing}`)
        .join(', '),
    };
  }

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  cancel(animationId: string): void {
    const task = this.activeAnimations.get(animationId);
    if (task) {
      task.cancelled = true;
      this.activeAnimations.delete(animationId);
    }
  }

  cancelAll(): void {
    for (const [, task] of this.activeAnimations) {
      task.cancelled = true;
    }
    this.activeAnimations.clear();
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  getStats(): {
    tier: MotionTier;
    prefersReducedMotion: boolean;
    activeAnimations: number;
    totalRun: number;
    totalSkipped: number;
    droppedFrames: number;
  } {
    return {
      tier: this.tier,
      prefersReducedMotion: this.prefersReducedMotion,
      activeAnimations: this.activeAnimations.size,
      totalRun: this.totalAnimationsRun,
      totalSkipped: this.totalAnimationsSkipped,
      droppedFrames: this.droppedFrameCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private runAnimation(element: HTMLElement, config: MotionConfig, onComplete?: () => void): string {
    this._animIdCounter = (this._animIdCounter + 1) & 0x7fffffff;
    const id = `anim-${this._animIdCounter}`;

    if (config.duration === 0) {
      this.totalAnimationsSkipped++;
      if (onComplete) onComplete();
      return id;
    }

    const task: AnimationTask = {
      id,
      element,
      config,
      startTime: performance.now(),
      onComplete,
      cancelled: false,
    };

    this.activeAnimations.set(id, task);
    this.totalAnimationsRun++;

    // Use Web Animations API when available
    if (element.animate && typeof element.animate === 'function') {
      try {
        const animation = element.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: config.duration,
            easing: config.easing === 'linear' ? 'linear' : 'ease-out',
            fill: 'forwards',
          }
        );

        animation.onfinish = () => {
          this.activeAnimations.delete(id);
          if (!task.cancelled && onComplete) onComplete();
        };

        animation.oncancel = () => {
          this.activeAnimations.delete(id);
        };

        return id;
      } catch {
        // Fallback to CSS transitions
      }
    }

    // Fallback: CSS transition
    this.transition(element, 'fade-in');
    setTimeout(() => {
      this.activeAnimations.delete(id);
      if (!task.cancelled && onComplete) onComplete();
    }, config.duration);

    return id;
  }

  private resolvePreset(preset: string): MotionConfig {
    const presets: Record<string, MotionConfig> = {
      'fade-in': { duration: MOTION_DURATION.FAST, easing: MOTION_EASING.EASE_OUT, properties: ['opacity'] },
      'fade-out': { duration: MOTION_DURATION.FAST, easing: MOTION_EASING.EASE_IN, properties: ['opacity'] },
      'slide-up': { duration: MOTION_DURATION.NORMAL, easing: MOTION_EASING.DECELERATE, properties: ['transform', 'opacity'] },
      'slide-down': { duration: MOTION_DURATION.NORMAL, easing: MOTION_EASING.DECELERATE, properties: ['transform', 'opacity'] },
      'scale-in': { duration: MOTION_DURATION.FAST, easing: MOTION_EASING.SPRING, properties: ['transform', 'opacity'] },
      'scale-out': { duration: MOTION_DURATION.FAST, easing: MOTION_EASING.EASE_IN, properties: ['transform', 'opacity'] },
      'modal-enter': { duration: MOTION_DURATION.MODAL_ENTER, easing: MOTION_EASING.DECELERATE, properties: ['transform', 'opacity'] },
      'modal-exit': { duration: MOTION_DURATION.MODAL_EXIT, easing: MOTION_EASING.ACCELERATE, properties: ['transform', 'opacity'] },
      'sidebar-open': { duration: MOTION_DURATION.SIDEBAR_TOGGLE, easing: MOTION_EASING.EASE_OUT, properties: ['transform', 'width'] },
      'sidebar-close': { duration: MOTION_DURATION.SIDEBAR_TOGGLE, easing: MOTION_EASING.EASE_IN, properties: ['transform', 'width'] },
      'page-enter': { duration: MOTION_DURATION.PAGE_TRANSITION, easing: MOTION_EASING.DECELERATE, properties: ['transform', 'opacity'] },
      'page-exit': { duration: MOTION_DURATION.PAGE_TRANSITION, easing: MOTION_EASING.ACCELERATE, properties: ['transform', 'opacity'] },
      'notification-enter': { duration: MOTION_DURATION.NOTIFICATION_ENTER, easing: MOTION_EASING.SPRING, properties: ['transform', 'opacity'] },
      'notification-exit': { duration: MOTION_DURATION.NOTIFICATION_EXIT, easing: MOTION_EASING.EASE_IN, properties: ['transform', 'opacity'] },
      'list-item': { duration: MOTION_DURATION.LIST_ITEM_ENTER, easing: MOTION_EASING.EASE_OUT, properties: ['transform', 'opacity'] },
      'tab-switch': { duration: MOTION_DURATION.TAB_SWITCH, easing: MOTION_EASING.SHARP, properties: ['opacity'] },
      'dropdown-open': { duration: MOTION_DURATION.DROPDOWN_OPEN, easing: MOTION_EASING.DECELERATE, properties: ['transform', 'opacity'] },
      'dropdown-close': { duration: MOTION_DURATION.DROPDOWN_CLOSE, easing: MOTION_EASING.ACCELERATE, properties: ['transform', 'opacity'] },

      // DEX Motion Framework — window category
      'window-open': { duration: MOTION_DURATION.WINDOW_OPEN, easing: MOTION_EASING.DECELERATE, properties: ['transform', 'opacity'] },
      'window-close': { duration: MOTION_DURATION.WINDOW_CLOSE, easing: MOTION_EASING.ACCELERATE, properties: ['transform', 'opacity'] },
      'window-minimize': { duration: MOTION_DURATION.WINDOW_MINIMIZE, easing: MOTION_EASING.ACCELERATE, properties: ['transform', 'opacity'] },
      'window-restore': { duration: MOTION_DURATION.WINDOW_RESTORE, easing: MOTION_EASING.DECELERATE, properties: ['transform', 'opacity'] },
      'window-expand': { duration: MOTION_DURATION.WINDOW_EXPAND, easing: MOTION_EASING.SPRING, properties: ['transform'] },
      // workspace category
      'workspace-switch': { duration: MOTION_DURATION.WORKSPACE_SWITCH, easing: MOTION_EASING.TAHOE, properties: ['transform', 'opacity'] },
      'project-switch': { duration: MOTION_DURATION.PROJECT_SWITCH, easing: MOTION_EASING.TAHOE, properties: ['transform', 'opacity'] },
      'focus-switch': { duration: MOTION_DURATION.FOCUS_SWITCH, easing: MOTION_EASING.DECELERATE, properties: ['opacity', 'filter'] },
      // dock category
      'dock-reveal': { duration: MOTION_DURATION.DOCK_REVEAL, easing: MOTION_EASING.DECELERATE, properties: ['transform', 'opacity'] },
      'dock-hide': { duration: MOTION_DURATION.DOCK_HIDE, easing: MOTION_EASING.ACCELERATE, properties: ['transform', 'opacity'] },
      'dock-launch': { duration: MOTION_DURATION.DOCK_LAUNCH, easing: MOTION_EASING.SPRING, properties: ['transform'] },
      'dock-hover': { duration: MOTION_DURATION.DOCK_HOVER, easing: MOTION_EASING.EASE_OUT, properties: ['transform'] },
      'dock-drag': { duration: MOTION_DURATION.DOCK_DRAG, easing: MOTION_EASING.EASE_OUT, properties: ['transform'] },
      // panel category
      'panel-expand': { duration: MOTION_DURATION.PANEL_EXPAND, easing: MOTION_EASING.DECELERATE, properties: ['transform', 'opacity'] },
      'panel-collapse': { duration: MOTION_DURATION.PANEL_COLLAPSE, easing: MOTION_EASING.ACCELERATE, properties: ['transform', 'opacity'] },
      'panel-reorganize': { duration: MOTION_DURATION.PANEL_REORGANIZE, easing: MOTION_EASING.SPRING, properties: ['transform'] },
    };

    return presets[preset] ?? { duration: MOTION_DURATION.NORMAL, easing: MOTION_EASING.EASE_OUT, properties: ['opacity'] };
  }

  private applyTier(config: MotionConfig): MotionConfig {
    if (this.tier === 3 || this.prefersReducedMotion) {
      return { ...config, duration: 0, easing: 'linear' };
    }
    // Track K2: hardware tier shortens durations on low-tier devices and may
    // lengthen them slightly on high-tier devices. Read the CSS variable set
    // by SystemTier so the math is centralized in one policy table.
    let hwScale = 1;
    if (typeof document !== 'undefined' && document.documentElement) {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--tier-anim-scale').trim();
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 2) hwScale = parsed;
    }
    if (this.tier === 2) {
      return {
        ...config,
        duration: Math.min(config.duration, THROTTLED_MAX_MS) * hwScale,
        easing: MOTION_EASING.LINEAR,
      };
    }
    return hwScale === 1 ? config : { ...config, duration: config.duration * hwScale };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    this.cancelAll();
    this.activeAnimations.clear();
    this.initialized = false;
  }
}

export const unifiedMotionSystem = new UnifiedMotionSystem();

export function initializeMotionSystem(): void {
  unifiedMotionSystem.initialize();
}

export function shutdownMotionSystem(): void {
  unifiedMotionSystem.shutdown();
}

// ===========================================================================
// Animation Budget (consolidated — DEX Consolidation Audit, finding 4)
// ===========================================================================
// The system-wide animation-budget engine (formerly utils/animationBudget.ts)
// now lives here as the single implementation. utils/animationBudget.ts re-
// exports these symbols so its importers keep working unchanged. Logic is a
// behaviour-preserving relocation: no thresholds, easing tables, state machine,
// or hook semantics were altered. The hardware PerformanceTier subsystem stays
// in utils/animationBudget.ts (it is capability detection, not motion).
// ---------------------------------------------------------------------------

import { useState as _useState, useEffect as _useEffect } from 'react';

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

interface BudgetAnimationState {
  enabled: boolean;
  reducedMotion: boolean;
  performanceMode: 'normal' | 'reduced' | 'disabled';
  lastFrameTime: number;
  frameTimeHistory: number[];
}

const budgetState: BudgetAnimationState = {
  enabled: true,
  reducedMotion: false,
  performanceMode: 'normal',
  lastFrameTime: 16,
  frameTimeHistory: [],
};

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------

let budgetInitialized = false;
let budgetFrameId: number | null = null;

/**
 * Initialize animation budget system
 * Call once at app startup
 */
export function initAnimationBudget(): () => void {
  if (budgetInitialized) {
    return () => {};
  }

  budgetInitialized = true;

  // Check reduced motion preference
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  budgetState.reducedMotion = mediaQuery.matches;
  // Apply immediately so callers see the correct mode before the first frame
  updateBudgetPerformanceMode();

  const handleMotionChange = (e: MediaQueryListEvent) => {
    budgetState.reducedMotion = e.matches;
    updateBudgetPerformanceMode();
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
    budgetState.frameTimeHistory.push(frameTime);
    if (budgetState.frameTimeHistory.length > 10) {
      budgetState.frameTimeHistory.shift();
    }

    budgetState.lastFrameTime = frameTime;

    // Update performance mode based on frame times
    updateBudgetPerformanceMode();
  };

  const scheduleSample = () => {
    sampleTimer = setTimeout(() => {
      budgetFrameId = requestAnimationFrame((time) => {
        measureFrame(time);
        scheduleSample();
      });
    }, 3000);
  };

  // Kick off the first sample
  budgetFrameId = requestAnimationFrame((time) => {
    lastTime = time;
    scheduleSample();
  });

  // Cleanup function
  return () => {
    mediaQuery.removeEventListener('change', handleMotionChange);
    if (budgetFrameId !== null) {
      cancelAnimationFrame(budgetFrameId);
      budgetFrameId = null;
    }
    if (sampleTimer !== null) {
      clearTimeout(sampleTimer);
      sampleTimer = null;
    }
    budgetInitialized = false;
  };
}

/**
 * Update performance mode based on current state
 */
function updateBudgetPerformanceMode(): void {
  if (budgetState.reducedMotion) {
    budgetState.performanceMode = 'disabled';
    return;
  }

  // Calculate average frame time
  if (budgetState.frameTimeHistory.length < 10) {
    budgetState.performanceMode = 'normal';
    return;
  }

  const avgFrameTime = budgetState.frameTimeHistory.reduce((a, b) => a + b, 0) / budgetState.frameTimeHistory.length;

  if (avgFrameTime > ANIMATION_CONFIG.frameBudgetThreshold * 2) {
    // Very poor performance - disable animations
    budgetState.performanceMode = 'disabled';
  } else if (avgFrameTime > ANIMATION_CONFIG.frameBudgetThreshold) {
    // Poor performance - reduce animations
    budgetState.performanceMode = 'reduced';
  } else {
    budgetState.performanceMode = 'normal';
  }
}

// -----------------------------------------------------------------------------
// API
// -----------------------------------------------------------------------------

/**
 * Check if animations are currently enabled
 */
export function areAnimationsEnabled(): boolean {
  return budgetState.enabled && budgetState.performanceMode !== 'disabled';
}

/**
 * Get current performance mode
 */
export function getPerformanceMode(): BudgetAnimationState['performanceMode'] {
  return budgetState.performanceMode;
}

/**
 * Manually enable/disable animations
 */
export function setAnimationsEnabled(enabled: boolean): void {
  budgetState.enabled = enabled;
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

  if (budgetState.reducedMotion || !budgetState.enabled) {
    return 0;
  }

  switch (budgetState.performanceMode) {
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

  if (budgetState.performanceMode === 'reduced') {
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

/**
 * Hook to get current animation duration for a type
 */
export function useAnimationDuration(
  type: 'micro' | 'fast' | 'normal' | 'slow' | number = 'normal'
): number {
  const [duration, setDuration] = _useState(() => getAnimationDuration(type));

  _useEffect(() => {
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
  const [enabled, setEnabled] = _useState(areAnimationsEnabled);

  _useEffect(() => {
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
export function useBudgetTransition(
  properties: string | string[],
  duration: 'micro' | 'fast' | 'normal' | 'slow' | number = 'fast'
): string {
  const d = useAnimationDuration(typeof duration === 'number' ? duration : ANIMATION_CONFIG[duration]);

  if (d === 0) return 'none';

  const props = Array.isArray(properties) ? properties : [properties];
  const easing = getEasing('default');

  return props.map(prop => `${prop} ${d}ms ${easing}`).join(', ');
}
