// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// When did the user last touch DEX (pointer, keys, wheel, touch)?
//
// For background MEASUREMENT only: frame-time samplers (FPS monitor, thermal
// sampler) request animation frames, and each frame wakes the compositor and
// the GPU process. With no input there is no interaction to measure jank for,
// so they skip their burst. This never changes what the user sees: DEX does
// not lock, dim or otherwise react to inactivity.

let lastInputAt = typeof performance !== 'undefined' ? performance.now() : 0;
let installed = false;

function mark(): void { lastInputAt = performance.now(); }

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, mark, opts);
}
install();

/** True when there was input within the last `withinMs` (default 15 s). */
export function userRecentlyActive(withinMs = 15_000): boolean {
  return performance.now() - lastInputAt <= withinMs;
}

/** Test hook. */
export function _markUserActivity(at?: number): void { lastInputAt = at ?? performance.now(); }
