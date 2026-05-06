// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Z-Index Token System
 * 
 * Mirrors CSS custom properties from design-system.css.
 * Use these constants in inline styles and TypeScript.
 * 
 * Layer architecture:
 *   Base (0-99)        — In-app content stacking
 *   Windows (100-4990) — Floating window depth (managed by WindowDepthManager)
 *   Shell (5000-9999)  — Dock, modals, overlays, menus, toasts
 *   Emergency (10000+) — Screen guard, crash recovery, gesture debug
 */

// ---------------------------------------------------------------------------
// BASE LAYERS (in-app content)
// ---------------------------------------------------------------------------
export const Z_BASE = 0;
export const Z_PANEL = 10;
export const Z_TOOLBAR = 20;
export const Z_SIDEBAR = 30;
export const Z_STICKY = 50;

// ---------------------------------------------------------------------------
// FLOATING WINDOW RANGE (managed by WindowDepthManager)
// ---------------------------------------------------------------------------
export const Z_WINDOW_MIN = 100;
export const Z_WINDOW_MAX = 4990;

// ---------------------------------------------------------------------------
// SHELL LAYERS
// ---------------------------------------------------------------------------
export const Z_DOCK = 5000;
export const Z_LAUNCHPAD = 5200;
export const Z_STAGE_MANAGER = 5400;
export const Z_MODAL_BACKDROP = 5500;
export const Z_MODAL = 6000;
export const Z_SHEET = 6500;
export const Z_OVERLAY = 7000;
export const Z_NOTIFICATION = 8000;
export const Z_SPOTLIGHT = 8500;
export const Z_DROPDOWN = 9000;
export const Z_POPOVER = 9200;
export const Z_TOOLTIP = 9400;
export const Z_MENU = 9500;
export const Z_CONTEXT_MENU = 9700;
export const Z_TOAST = 9900;
export const Z_MAX = 9999;

// ---------------------------------------------------------------------------
// EMERGENCY LAYERS (above all shell UI)
// ---------------------------------------------------------------------------
export const Z_DRAG_OVERLAY = 10000;
export const Z_SCREEN_GUARD = 20000;
export const Z_GESTURE_DEBUG = 30000;
export const Z_CRASH_RECOVERY = 40000;
export const Z_EMERGENCY = 50000;

// ---------------------------------------------------------------------------
// GROUPED EXPORTS
// ---------------------------------------------------------------------------
export const Z_LAYERS = {
  // Base
  base: Z_BASE,
  panel: Z_PANEL,
  toolbar: Z_TOOLBAR,
  sidebar: Z_SIDEBAR,
  sticky: Z_STICKY,
  
  // Window range
  windowMin: Z_WINDOW_MIN,
  windowMax: Z_WINDOW_MAX,
  
  // Shell
  dock: Z_DOCK,
  launchpad: Z_LAUNCHPAD,
  stageManager: Z_STAGE_MANAGER,
  modalBackdrop: Z_MODAL_BACKDROP,
  modal: Z_MODAL,
  sheet: Z_SHEET,
  overlay: Z_OVERLAY,
  notification: Z_NOTIFICATION,
  spotlight: Z_SPOTLIGHT,
  dropdown: Z_DROPDOWN,
  popover: Z_POPOVER,
  tooltip: Z_TOOLTIP,
  menu: Z_MENU,
  contextMenu: Z_CONTEXT_MENU,
  toast: Z_TOAST,
  max: Z_MAX,
  
  // Emergency
  dragOverlay: Z_DRAG_OVERLAY,
  screenGuard: Z_SCREEN_GUARD,
  gestureDebug: Z_GESTURE_DEBUG,
  crashRecovery: Z_CRASH_RECOVERY,
  emergency: Z_EMERGENCY,
} as const;

// Type for layer names
export type ZLayerName = keyof typeof Z_LAYERS;

/**
 * Get z-index value by layer name
 */
export function getZIndex(layer: ZLayerName): number {
  return Z_LAYERS[layer];
}

/**
 * Check if a z-index is in the floating window range
 */
export function isWindowLayer(z: number): boolean {
  return z >= Z_WINDOW_MIN && z <= Z_WINDOW_MAX;
}

/**
 * Check if a z-index is an emergency layer
 */
export function isEmergencyLayer(z: number): boolean {
  return z >= Z_DRAG_OVERLAY;
}
