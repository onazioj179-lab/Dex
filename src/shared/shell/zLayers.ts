// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * zLayers — single source of truth for shell stacking order.
 *
 * Every floating, overlay, modal, or chrome surface in DEX should pick its
 * z-index from this token set instead of typing a literal number. The
 * Phase 15 release audit's `allowedZIndices` list is kept in sync with the
 * values exported here.
 *
 * Buckets (low to high):
 *   - BASE        : in-flow content
 *   - DESKTOP     : Home wallpaper, desktop widgets
 *   - WINDOWS     : floating app windows (managed dynamically; baseline)
 *   - DOCK        : Dock surface
 *   - CHROME      : titlebar, status row
 *   - SPOTLIGHT   : Spotlight, command palette
 *   - OVERLAY     : tooltips, hover cards
 *   - DROPDOWN    : menus, selects, popovers
 *   - DIALOG      : modal dialogs, confirmations
 *   - TOAST       : transient notifications
 *   - LOCK        : lock screen, auth gate
 *   - SPLASH      : startup splash, top-of-stack overlays
 *
 * IMPORTANT: never write a literal z-index in a new file — always import
 * `Z_*` from this module so the audit allowlist stays in sync.
 */

export const Z_BASE = 0;
export const Z_DESKTOP = 1;
export const Z_WINDOWS = 10;
export const Z_DOCK = 50;
export const Z_CHROME = 100;
export const Z_SPOTLIGHT = 500;
export const Z_OVERLAY = 1000;
export const Z_DROPDOWN = 1500;
export const Z_DIALOG = 2000;
export const Z_TOAST = 5000;
export const Z_LOCK = 9000;
export const Z_SPLASH = 9999;

/** All allowed z-index values, ordered. Mirrors Phase 15 audit allowlist. */
export const Z_LAYERS = Object.freeze([
    Z_BASE,
    Z_DESKTOP,
    Z_WINDOWS,
    Z_DOCK,
    Z_CHROME,
    Z_SPOTLIGHT,
    Z_OVERLAY,
    Z_DROPDOWN,
    Z_DIALOG,
    Z_TOAST,
    Z_LOCK,
    Z_SPLASH,
] as const);

export type ZLayer = typeof Z_LAYERS[number];
