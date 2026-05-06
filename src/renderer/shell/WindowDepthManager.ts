// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Window Depth Manager
 * Manages z-index ordering for floating windows using a single
 * monotonically increasing counter that never resets.
 * 
 * Uses z-index tokens from design-system.css:
 *   Windows occupy Z_WINDOW_MIN (100) to Z_WINDOW_MAX (4990)
 *   Dock and shell layers start at Z_DOCK (5000)
 */

import { Z_WINDOW_MIN, Z_WINDOW_MAX } from '../utils/zIndexTokens';

// ---------------------------------------------------------------------------
// DEPTH COUNTER
// ---------------------------------------------------------------------------

let _counter = Z_WINDOW_MIN; // Start at window layer minimum
const MAX_DEPTH = Z_WINDOW_MAX; // Stay below dock layer

const _windowDepths = new Map<string, number>();

/**
 * Normalize all depths when counter gets too high.
 * Preserves relative ordering while resetting to low values.
 */
function _normalizeIfNeeded(): void {
  if (_counter < MAX_DEPTH) return;
  const entries = Array.from(_windowDepths.entries())
    .sort((a, b) => a[1] - b[1]);
  _counter = Z_WINDOW_MIN;
  for (const [id] of entries) {
    _counter += 1;
    _windowDepths.set(id, _counter);
  }
}

/**
 * Bring a window to the front. Returns the new z-index.
 */
export function bringToFront(windowId: string): number {
  _normalizeIfNeeded();
  _counter += 1;
  _windowDepths.set(windowId, _counter);
  return _counter;
}

/**
 * Get the current z-index for a window.
 */
export function getDepth(windowId: string): number {
  return _windowDepths.get(windowId) ?? bringToFront(windowId);
}

/**
 * Remove a window's depth tracking (called on close).
 */
export function removeWindow(windowId: string): void {
  _windowDepths.delete(windowId);
}

/**
 * Check if a window is the frontmost.
 */
export function isFrontmost(windowId: string): boolean {
  const depth = _windowDepths.get(windowId) ?? 0;
  let maxDepth = 0;
  _windowDepths.forEach(d => { if (d > maxDepth) maxDepth = d; });
  return depth === maxDepth;
}

/**
 * Get all tracked windows sorted by depth (back to front).
 */
export function getWindowsByDepth(): string[] {
  return Array.from(_windowDepths.entries())
    .sort((a, b) => a[1] - b[1])
    .map(e => e[0]);
}
