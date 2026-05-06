// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Motion Constants
// ==========================================================================
// Single source of truth for all animation durations, easings, and
// thresholds. No magic numbers anywhere else in the codebase.
// ==========================================================================

// ---------------------------------------------------------------------------
// Durations (milliseconds)
// ---------------------------------------------------------------------------

export const MOTION_DURATION = {
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
  SKELETON_PULSE: 1500,
  PROGRESS_BAR: 300,
  FOCUS_RING: 120,
} as const;

// ---------------------------------------------------------------------------
// Easings (CSS cubic-bezier and keywords)
// ---------------------------------------------------------------------------

export const MOTION_EASING = {
  LINEAR: 'linear',
  EASE_OUT: 'cubic-bezier(0.0, 0.0, 0.2, 1.0)',
  EASE_IN: 'cubic-bezier(0.4, 0.0, 1.0, 1.0)',
  EASE_IN_OUT: 'cubic-bezier(0.4, 0.0, 0.2, 1.0)',
  DECELERATE: 'cubic-bezier(0.0, 0.0, 0.2, 1.0)',
  ACCELERATE: 'cubic-bezier(0.4, 0.0, 1.0, 1.0)',
  SHARP: 'cubic-bezier(0.4, 0.0, 0.6, 1.0)',
  BOUNCE: 'cubic-bezier(0.34, 1.56, 0.64, 1.0)',
  SPRING: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const MOTION_THRESHOLDS = {
  // CPU load percentage above which animations are reduced
  CPU_THROTTLE_PERCENT: 75,
  // Maximum duration when CPU is throttled
  THROTTLED_MAX_MS: 80,
  // Frame budget in milliseconds (16.67ms for 60fps)
  FRAME_BUDGET_MS: 16.67,
  // Dropped frame threshold before skipping ahead
  DROPPED_FRAME_SKIP_COUNT: 3,
  // Minimum frame rate before disabling animations
  MIN_FPS_FOR_ANIMATION: 24,
} as const;

// ---------------------------------------------------------------------------
// Capability tiers
// ---------------------------------------------------------------------------

export const MOTION_TIERS = {
  // Tier 1: Full animations (modern hardware, low load)
  FULL: 1,
  // Tier 2: Reduced animations (moderate hardware or medium load)
  REDUCED: 2,
  // Tier 3: No animations (low-end hardware, high load, or user preference)
  NONE: 3,
} as const;

// ---------------------------------------------------------------------------
// Presets: named animation configurations
// ---------------------------------------------------------------------------

export interface MotionPreset {
  duration: number;
  easing: string;
  properties: string[];
}

export const MOTION_PRESETS: Record<string, MotionPreset> = {
  'fade-in': {
    duration: MOTION_DURATION.FAST,
    easing: MOTION_EASING.EASE_OUT,
    properties: ['opacity'],
  },
  'fade-out': {
    duration: MOTION_DURATION.FAST,
    easing: MOTION_EASING.EASE_IN,
    properties: ['opacity'],
  },
  'slide-up': {
    duration: MOTION_DURATION.NORMAL,
    easing: MOTION_EASING.DECELERATE,
    properties: ['transform', 'opacity'],
  },
  'slide-down': {
    duration: MOTION_DURATION.NORMAL,
    easing: MOTION_EASING.DECELERATE,
    properties: ['transform', 'opacity'],
  },
  'scale-in': {
    duration: MOTION_DURATION.FAST,
    easing: MOTION_EASING.SPRING,
    properties: ['transform', 'opacity'],
  },
  'scale-out': {
    duration: MOTION_DURATION.FAST,
    easing: MOTION_EASING.EASE_IN,
    properties: ['transform', 'opacity'],
  },
  'modal-enter': {
    duration: MOTION_DURATION.MODAL_ENTER,
    easing: MOTION_EASING.DECELERATE,
    properties: ['transform', 'opacity'],
  },
  'modal-exit': {
    duration: MOTION_DURATION.MODAL_EXIT,
    easing: MOTION_EASING.ACCELERATE,
    properties: ['transform', 'opacity'],
  },
  'sidebar-open': {
    duration: MOTION_DURATION.SIDEBAR_TOGGLE,
    easing: MOTION_EASING.EASE_OUT,
    properties: ['transform', 'width'],
  },
  'sidebar-close': {
    duration: MOTION_DURATION.SIDEBAR_TOGGLE,
    easing: MOTION_EASING.EASE_IN,
    properties: ['transform', 'width'],
  },
  'page-enter': {
    duration: MOTION_DURATION.PAGE_TRANSITION,
    easing: MOTION_EASING.DECELERATE,
    properties: ['transform', 'opacity'],
  },
  'page-exit': {
    duration: MOTION_DURATION.PAGE_TRANSITION,
    easing: MOTION_EASING.ACCELERATE,
    properties: ['transform', 'opacity'],
  },
  'notification-enter': {
    duration: MOTION_DURATION.NOTIFICATION_ENTER,
    easing: MOTION_EASING.SPRING,
    properties: ['transform', 'opacity'],
  },
  'notification-exit': {
    duration: MOTION_DURATION.NOTIFICATION_EXIT,
    easing: MOTION_EASING.EASE_IN,
    properties: ['transform', 'opacity'],
  },
  'list-item': {
    duration: MOTION_DURATION.LIST_ITEM_ENTER,
    easing: MOTION_EASING.EASE_OUT,
    properties: ['transform', 'opacity'],
  },
  'tab-switch': {
    duration: MOTION_DURATION.TAB_SWITCH,
    easing: MOTION_EASING.SHARP,
    properties: ['opacity'],
  },
  'dropdown-open': {
    duration: MOTION_DURATION.DROPDOWN_OPEN,
    easing: MOTION_EASING.DECELERATE,
    properties: ['transform', 'opacity'],
  },
  'dropdown-close': {
    duration: MOTION_DURATION.DROPDOWN_CLOSE,
    easing: MOTION_EASING.ACCELERATE,
    properties: ['transform', 'opacity'],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getDurationForTier(baseDuration: number, tier: number): number {
  if (tier === MOTION_TIERS.NONE) return 0;
  if (tier === MOTION_TIERS.REDUCED) return Math.min(baseDuration, MOTION_THRESHOLDS.THROTTLED_MAX_MS);
  return baseDuration;
}

export function getEasingForTier(baseEasing: string, tier: number): string {
  if (tier === MOTION_TIERS.NONE) return 'linear';
  if (tier === MOTION_TIERS.REDUCED) return MOTION_EASING.LINEAR;
  return baseEasing;
}
