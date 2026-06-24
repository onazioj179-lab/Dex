// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * WCAG 2.2 SC 2.5.8 — Target Size (Minimum), Level AA (DEX_FEATURE_BACKLOG 05, P0).
 *
 * Pointer targets must be at least 24x24 CSS pixels, UNLESS one of the spec's
 * exceptions applies: Spacing (an undersized target is offset so a 24px-diameter
 * circle centred on it doesn't intersect another target's), Equivalent (another
 * control does the same at >=24px), Inline (the target sits within a line of
 * text), User-Agent (the UA controls the size), or Essential (the exact size is
 * essential to the information). This module is the pure checker the dock,
 * window-controls, ZoneEditor and CommandPalette hit-areas are audited against —
 * no DOM, fully unit-testable. A thin `auditRects` runs it over measured rects.
 *
 * Source: https://www.w3.org/TR/WCAG22/#target-size-minimum (3-vote verified).
 */

export const TARGET_MIN = 24;

export interface TargetRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Spec exceptions a caller can assert for a given target. */
export interface TargetExceptions {
  inline?: boolean;     // target is within a sentence / block of text
  essential?: boolean;  // the exact presentation is essential (e.g. a map pin)
  equivalent?: boolean; // an equivalent >=24px control exists elsewhere
  userAgent?: boolean;  // size is controlled by the user agent
}

export function meetsMinimumSize(w: number, h: number): boolean {
  return w >= TARGET_MIN && h >= TARGET_MIN;
}

function center(r: TargetRect): { cx: number; cy: number } {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

/**
 * The Spacing exception: for an UNDERSIZED target, a 24px-diameter circle centred
 * on it must not intersect any other target (or another undersized target's
 * circle). Practically: the centre-to-centre distance to every other target is at
 * least TARGET_MIN (so the two 24px circles are tangent at worst).
 */
export function spacingSatisfied(target: TargetRect, others: ReadonlyArray<TargetRect>): boolean {
  const a = center(target);
  for (const o of others) {
    if (o.id === target.id) continue;
    const b = center(o);
    const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    if (dist < TARGET_MIN) return false;
  }
  return true;
}

export interface TargetVerdict {
  id: string;
  passes: boolean;
  reason: string;
}

export interface AuditOptions {
  /**
   * Strict mode IGNORES the spacing exception, so any undersized target is flagged
   * even when well-spaced. The spacing exception is spec-valid, but for an
   * actionable shell audit we usually want to grow every hit-area to 24px rather
   * than rely on spacing — so DEX's own audit runs strict by default.
   */
  strict?: boolean;
}

/** Evaluate one target against SC 2.5.8 (size first, then each exception). */
export function evaluateTarget(
  target: TargetRect,
  others: ReadonlyArray<TargetRect> = [],
  exceptions: TargetExceptions = {},
  opts: AuditOptions = {},
): TargetVerdict {
  if (meetsMinimumSize(target.w, target.h)) {
    return { id: target.id, passes: true, reason: 'meets 24x24 minimum' };
  }
  if (exceptions.essential) return { id: target.id, passes: true, reason: 'essential exception' };
  if (exceptions.inline) return { id: target.id, passes: true, reason: 'inline exception' };
  if (exceptions.equivalent) return { id: target.id, passes: true, reason: 'equivalent-control exception' };
  if (exceptions.userAgent) return { id: target.id, passes: true, reason: 'user-agent exception' };
  if (!opts.strict && spacingSatisfied(target, others)) {
    return { id: target.id, passes: true, reason: 'spacing exception' };
  }
  return {
    id: target.id,
    passes: false,
    reason: `undersized ${Math.round(target.w)}x${Math.round(target.h)} (<24x24) with no exception`,
  };
}

/**
 * Audit a set of measured target rects. Returns only the FAILURES (empty = the
 * surface conforms). `exceptionsById` lets the caller flag known-exempt targets.
 * Defaults to STRICT (see AuditOptions) — pass `{ strict: false }` for a
 * spec-faithful audit that accepts the spacing exception.
 */
export function auditRects(
  rects: ReadonlyArray<TargetRect>,
  exceptionsById: Record<string, TargetExceptions> = {},
  opts: AuditOptions = { strict: true },
): TargetVerdict[] {
  return rects
    .map((r) => evaluateTarget(r, rects, exceptionsById[r.id] ?? {}, opts))
    .filter((v) => !v.passes);
}

/**
 * DOM audit helper (renderer-only; not unit-tested headlessly). Measures every
 * element matching `selector` and reports SC 2.5.8 failures — useful as a dev
 * assertion or an in-app accessibility check.
 */
export function auditDomTargets(
  selector = 'button, [role="button"], a[href], input, [data-target]',
  root: { querySelectorAll: (s: string) => ArrayLike<Element> } | null =
    typeof document !== 'undefined' ? document : null,
): TargetVerdict[] {
  if (!root) return [];
  const els = Array.from(root.querySelectorAll(selector)) as Element[];
  const rects: TargetRect[] = els.map((el, i) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    return { id: (el as HTMLElement).getAttribute('data-a11y-id') || `${el.tagName.toLowerCase()}#${i}`, x: r.x, y: r.y, w: r.width, h: r.height };
  });
  return auditRects(rects);
}
