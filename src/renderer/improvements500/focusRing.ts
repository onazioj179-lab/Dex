// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Focus-visible helper. Tracks whether the user last interacted via keyboard;
 * applies a class on the documentElement so CSS `:focus-visible`-style styling
 * can fall back to a class for older browsers / synthetic focus.
 */

export interface FocusVisibleController {
  start(): void;
  stop(): void;
  isKeyboardMode(): boolean;
}

export interface FocusVisibleOptions {
  className?: string;
  target?: HTMLElement | null;
}

export function createFocusVisible(options: FocusVisibleOptions = {}): FocusVisibleController {
  const className = options.className ?? 'dex-keyboard-focus';
  const target = options.target ?? (typeof document !== 'undefined' ? document.documentElement : null);
  let keyboardMode = false;
  let active = false;

  const setMode = (mode: boolean): void => {
    if (mode === keyboardMode) return;
    keyboardMode = mode;
    if (!target) return;
    if (mode) target.classList.add(className);
    else target.classList.remove(className);
  };

  const onKey = (e: KeyboardEvent): void => {
    // Tab, arrows, Enter, Space etc. count; modifier-only does not.
    if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return;
    setMode(true);
  };
  const onPointer = (): void => setMode(false);

  return {
    start(): void {
      if (active || typeof window === 'undefined') return;
      active = true;
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('mousedown', onPointer, true);
      window.addEventListener('pointerdown', onPointer, true);
      window.addEventListener('touchstart', onPointer, true);
    },
    stop(): void {
      if (!active || typeof window === 'undefined') return;
      active = false;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('touchstart', onPointer, true);
      setMode(false);
    },
    isKeyboardMode(): boolean {
      return keyboardMode;
    },
  };
}
