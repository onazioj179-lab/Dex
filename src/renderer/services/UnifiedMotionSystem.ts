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
