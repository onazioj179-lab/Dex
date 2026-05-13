// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * White-screen detection helper. Walks a candidate root element and decides
 * whether the visible region is "blank" - which usually means a render or
 * boot failure. Heuristics: no descendant elements with non-zero size, or all
 * descendants invisible (display:none / visibility:hidden / zero opacity).
 *
 * The DOM access is gated so this module is safe in non-browser environments.
 */

export interface WhiteScreenReport {
  blank: boolean;
  reason: string;
  visibleNodeCount: number;
}

export interface WhiteScreenOptions {
  /** Maximum descendants to scan before giving up (default: 500). */
  maxNodes?: number;
}

interface MinimalElement {
  children: ArrayLike<MinimalElement> | { length: number; item(i: number): MinimalElement | null };
  getBoundingClientRect?: () => { width: number; height: number };
}

function getStyleValue(el: unknown, prop: string): string | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  const win = globalThis as { getComputedStyle?: (e: object) => CSSStyleDeclaration };
  if (typeof win.getComputedStyle !== 'function') return undefined;
  if (!el || typeof el !== 'object') return undefined;
  try {
    return win.getComputedStyle(el as object).getPropertyValue(prop);
  } catch {
    return undefined;
  }
}

function isVisible(el: MinimalElement): boolean {
  const display = getStyleValue(el, 'display');
  if (display === 'none') return false;
  const visibility = getStyleValue(el, 'visibility');
  if (visibility === 'hidden' || visibility === 'collapse') return false;
  const opacity = getStyleValue(el, 'opacity');
  if (opacity !== undefined && opacity !== '' && Number(opacity) === 0) return false;
  if (typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return false;
  }
  return true;
}

export function detectWhiteScreen(
  root: MinimalElement | null | undefined,
  opts: WhiteScreenOptions = {},
): WhiteScreenReport {
  const max = opts.maxNodes ?? 500;
  if (!root) {
    return { blank: true, reason: 'no-root', visibleNodeCount: 0 };
  }
  let visible = 0;
  const stack: MinimalElement[] = [root];
  let scanned = 0;
  while (stack.length > 0 && scanned < max) {
    const node = stack.pop() as MinimalElement;
    scanned += 1;
    if (isVisible(node)) visible += 1;
    const children = node.children as ArrayLike<MinimalElement>;
    if (children && typeof children.length === 'number') {
      for (let i = 0; i < children.length; i += 1) {
        const c = (children as { [k: number]: MinimalElement })[i];
        if (c) stack.push(c);
      }
    }
  }
  if (visible === 0) {
    return { blank: true, reason: 'no-visible-descendants', visibleNodeCount: 0 };
  }
  if (visible === 1) {
    return { blank: true, reason: 'only-root-visible', visibleNodeCount: 1 };
  }
  return { blank: false, reason: 'ok', visibleNodeCount: visible };
}
