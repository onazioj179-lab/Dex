// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Tooltips are OFF by default (owner: hover popups over controls get in the
// way). The help they carried lives in Settings > Help. Settings > Help has a
// "Show tooltips" switch to bring them back.
//
// Most tooltips are native `title` attributes. Just before the browser would
// show one (pointer over the element), its title moves to aria-label (when the
// element has no label of its own) so screen readers keep the name, and the
// title attribute is removed, so nothing pops up. React only rewrites the
// attribute when the prop changes; the next hover strips it again.

const KEY = 'dex-show-tooltips';
export const TOOLTIPS_CHANGED = 'dex-tooltips-changed';

export function tooltipsEnabled(): boolean {
  try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
}

export function setTooltipsEnabled(on: boolean): void {
  try { localStorage.setItem(KEY, String(on)); } catch { /* storage full */ }
  document.documentElement.toggleAttribute('data-dex-tooltips', on);
  window.dispatchEvent(new Event(TOOLTIPS_CHANGED));
}

/** Strip the title from `el` and its ancestors (keeping it as the accessible name). */
export function stripTitles(start: Element | null): void {
  for (let el = start; el && el !== document.documentElement; el = el.parentElement) {
    const t = el.getAttribute('title');
    if (t == null) continue;
    if (t && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !(el.textContent || '').trim()) {
      el.setAttribute('aria-label', t);
    }
    el.removeAttribute('title');
  }
}

let installed = false;

export function installTooltipSuppression(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  document.documentElement.toggleAttribute('data-dex-tooltips', tooltipsEnabled());
  const onOver = (e: Event) => {
    if (document.documentElement.hasAttribute('data-dex-tooltips')) return;
    stripTitles(e.target instanceof Element ? e.target : null);
  };
  // Capture phase, before the browser's tooltip delay starts.
  document.addEventListener('pointerover', onOver, true);
  document.addEventListener('focusin', onOver, true);
}
