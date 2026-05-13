// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Text measurement helpers built on a single shared offscreen canvas. Used by
 * layout code that needs ad-hoc width/height without inserting DOM nodes.
 *
 * Falls back to an approximation (~0.5 * fontSize per char) in non-DOM
 * environments so callers stay portable.
 */

let cachedCtx: CanvasRenderingContext2D | null | undefined;

function getCtx(): CanvasRenderingContext2D | null {
  if (cachedCtx !== undefined) return cachedCtx;
  const g = globalThis as { document?: Document };
  if (typeof g.document === 'undefined') {
    cachedCtx = null;
    return null;
  }
  try {
    const canvas = g.document.createElement('canvas');
    cachedCtx = canvas.getContext('2d');
  } catch {
    cachedCtx = null;
  }
  return cachedCtx ?? null;
}

export interface TextMetricsResult {
  width: number;
  /** Approximate ascent + descent (font size in fallback path). */
  height: number;
}

export function measureText(text: string, fontSize: number, fontFamily = 'sans-serif'): TextMetricsResult {
  const ctx = getCtx();
  if (!ctx) {
    return { width: text.length * fontSize * 0.5, height: fontSize };
  }
  ctx.font = `${fontSize}px ${fontFamily}`;
  const m = ctx.measureText(text);
  const ascent = (m as TextMetrics & { actualBoundingBoxAscent?: number }).actualBoundingBoxAscent;
  const descent = (m as TextMetrics & { actualBoundingBoxDescent?: number }).actualBoundingBoxDescent;
  const height = ascent !== undefined && descent !== undefined ? ascent + descent : fontSize;
  return { width: m.width, height };
}

/** Truncate `text` so its measured width fits within `maxWidth`, appending ellipsis. */
export function truncateToWidth(text: string, fontSize: number, maxWidth: number, fontFamily = 'sans-serif'): string {
  const full = measureText(text, fontSize, fontFamily);
  if (full.width <= maxWidth) return text;
  const ellipsis = '\u2026';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const candidate = text.slice(0, mid) + ellipsis;
    if (measureText(candidate, fontSize, fontFamily).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ellipsis : text.slice(0, lo) + ellipsis;
}

/** Reset the cached context (used by tests that swap out the DOM). */
export function _resetTextMetricsForTests(): void {
  cachedCtx = undefined;
}
