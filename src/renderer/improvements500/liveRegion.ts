// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Global aria-live announcer (T1-051, T1-057, T1-059).
 *
 * One persistent live region per politeness level; consumers call
 * `announce('text')` / `announce('text', 'assertive')` from anywhere.
 */

type Politeness = 'polite' | 'assertive';

const REGION_ID = 'dex-live-region';

function ensureRegion(politeness: Politeness): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const id = `${REGION_ID}-${politeness}`;
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement('div');
  el.id = id;
  el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
  el.setAttribute('aria-live', politeness);
  el.setAttribute('aria-atomic', 'true');
  el.style.position = 'absolute';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.padding = '0';
  el.style.margin = '-1px';
  el.style.overflow = 'hidden';
  el.style.clip = 'rect(0,0,0,0)';
  el.style.whiteSpace = 'nowrap';
  el.style.border = '0';
  document.body.appendChild(el);
  return el;
}

export function announce(message: string, politeness: Politeness = 'polite'): void {
  const region = ensureRegion(politeness);
  if (!region) return;
  // Clearing then setting forces SR re-announcement of identical strings.
  region.textContent = '';
  // Defer one tick so the empty value flushes.
  setTimeout(() => { if (region) region.textContent = message; }, 16);
}

/** Test helper: tear down regions. */
export function _teardown(): void {
  if (typeof document === 'undefined') return;
  for (const p of ['polite', 'assertive'] as Politeness[]) {
    const el = document.getElementById(`${REGION_ID}-${p}`);
    el?.remove();
  }
}
