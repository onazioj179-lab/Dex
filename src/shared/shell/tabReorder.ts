// =============================================================================
// DEX Platform — Shell: tab drag-to-place reorder math
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Pure geometry for ghost-drag tab reordering. The AppManager tab bar feeds in
 * each tab's on-screen centre (measured from the DOM) plus the pointer X, and
 * gets back the index the dragged tab should drop into. Keeping this side-effect
 * free means the placement logic — the part that has to feel exactly right —
 * is deterministic and unit-testable without a DOM.
 */

export interface TabCenter {
  id: string;
  /** Horizontal centre of the tab in viewport pixels. */
  center: number;
}

/**
 * Insertion index for `draggingId` given the pointer X, computed against the
 * centres of the OTHER tabs (the dragged tab's own slot is ignored). The result
 * is the index within the order array AFTER the dragged id is removed — exactly
 * what `moveTab` expects — so it ranges 0..(n-1).
 *
 * `order` must be in current visual (left-to-right) order.
 */
export function computeTabDropIndex(order: TabCenter[], draggingId: string, pointerX: number): number {
  let idx = 0;
  for (const tab of order) {
    if (tab.id === draggingId) continue;          // skip our own slot
    if (pointerX > tab.center) idx++;             // pointer is past this tab -> go after it
    else break;                                   // first tab whose centre is right of pointer
  }
  return idx;
}

/**
 * Move `id` to `toIndex` within `order`, returning a new array. `toIndex` is an
 * index into the array WITHOUT `id` and is clamped, so out-of-range values are
 * safe. If `id` is absent the array is returned unchanged.
 */
export function moveTab(order: string[], id: string, toIndex: number): string[] {
  if (!order.includes(id)) return order.slice();
  const without = order.filter((x) => x !== id);
  const i = Math.max(0, Math.min(without.length, toIndex));
  without.splice(i, 0, id);
  return without;
}

/** True when two id-orders are identical (used to skip no-op state updates mid-drag). */
export function sameOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
