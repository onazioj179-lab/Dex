// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Modal focus trap + initial focus + ESC dismiss (T1-050).
 *
 * `useFocusTrap(active, onEscape)` — attach the returned ref to the dialog
 * root. Tab cycles inside; ESC fires onEscape; initial focus lands on the
 * first focusable child (or the dialog itself).
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function listFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useFocusTrap(active: boolean, onEscape?: () => void): React.RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);
  const previousActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    previousActive.current = document.activeElement as HTMLElement | null;
    const focusables = listFocusable(root);
    (focusables[0] ?? root).focus();
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) { e.stopPropagation(); onEscape(); return; }
      if (e.key !== 'Tab') return;
      const list = listFocusable(root);
      if (list.length === 0) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      previousActive.current?.focus();
    };
  }, [active, onEscape]);

  return ref;
}
