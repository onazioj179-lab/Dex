// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Creative Studio mode switching, shared by the Studio shell, the board and
// the app launcher (kept apart from CreativeStudio.tsx to avoid an import cycle).

export type StudioMode = 'board' | 'slides';
export const STUDIO_MODE_EVENT = 'dex-creative-studio-mode';
export const STUDIO_MODE_KEY = 'dex-creative-studio-mode';

/** Switch the Studio to a mode (also remembered for the next open). */
export function setStudioMode(mode: StudioMode): void {
  try { localStorage.setItem(STUDIO_MODE_KEY, mode); } catch { /* per-viewer convenience only */ }
  try { window.dispatchEvent(new CustomEvent(STUDIO_MODE_EVENT, { detail: { mode } })); } catch { /* non-DOM */ }
}

export function storedStudioMode(): StudioMode {
  try { return localStorage.getItem(STUDIO_MODE_KEY) === 'slides' ? 'slides' : 'board'; } catch { return 'board'; }
}
