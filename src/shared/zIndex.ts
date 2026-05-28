// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Single source of truth for all stacking layers. Keep values in ascending
// order. Never hard-code z-index values in components — import from here.
//
// Ladder:
//   floating windows < dock < share/fixed panels < dropdowns < MiniPulse
//   < PiP < diagnostics < help/overlays < focus session
// =============================================================================

/** Floating windows (FloatingWindow.tsx). Baseline 200, cap 4990. */
export const Z_FLOATING_WINDOW_BASE = 200;
export const Z_FLOATING_WINDOW_MAX  = 4990;

/** Dock / taskbar. */
export const Z_DOCK = 5000;

/** Fixed panels that must sit above dock but below dropdowns (e.g. ShareDialog, ChatPanel). */
export const Z_PANEL = 5500;

/** Dropdown menus, context menus, command palette, confirm dialogs. */
export const Z_DROPDOWN_BASE = 6000;
export const Z_DROPDOWN_MAX  = 9000;

/** MiniPulse pill — inside dropdown band, below DiagnosticsPanel. */
export const Z_MINI_PULSE = 8500;

/** Picture-in-picture overlay — above dropdowns, below diagnostics. */
export const Z_PIP = 9900;

/** DiagnosticsPanel / developer overlay. */
export const Z_DIAGNOSTICS = 9999;

/** Help overlay, onboarding, guidance layers. */
export const Z_HELP_OVERLAY_BASE = 10000;
export const Z_HELP_OVERLAY_MAX  = 12000;

/** Focus Session overlay. BASE = tinted bg, TOP = controls. */
export const Z_FOCUS_SESSION     = 99998;
export const Z_FOCUS_SESSION_TOP = 99999;
