// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Geometry of the Morphing Dock, in px along its edge. Layout:
//   [pad][pinned apps][gap][search trigger][gap][running apps][pad]
// The trigger is the shared element: it is the whole collapsed Dock, and the
// expanded Dock grows out of it, so it never moves while the Dock morphs.

import type { DockAlign, DockEdge } from '../../../shared/shell/dockGeometry';
import type { WorkArea } from '../../../shared/shell/workArea';
import { DOCK_TILE, DOCK_PAD } from '../../store/dockStore';

export const DOCK_GAP = 4;
export const DOCK_GROUP_GAP = 10; // space either side of the trigger (holds the divider)

export interface DockLayout {
  /** Length of the pinned group (0 when empty). */
  pinnedLen: number;
  runningLen: number;
  /** Full expanded length, not yet capped. */
  expandedLen: number;
  /** Centre of the trigger, measured from the Dock's start, expanded. */
  triggerCenter: number;
  /** The collapsed Dock: one tile plus padding (a circle). */
  collapsedLen: number;
}

export function dockLayout(pinned: number, running: number, tile = DOCK_TILE, pad = DOCK_PAD): DockLayout {
  const g = (n: number) => (n > 0 ? n * tile + (n - 1) * DOCK_GAP : 0);
  const pinnedLen = g(pinned);
  const runningLen = g(running);
  const before = pinnedLen ? pinnedLen + DOCK_GROUP_GAP : 0;
  const after = runningLen ? runningLen + DOCK_GROUP_GAP : 0;
  return {
    pinnedLen,
    runningLen,
    expandedLen: pad * 2 + before + tile + after,
    triggerCenter: pad + before + tile / 2,
    collapsedLen: pad * 2 + tile,
  };
}

/** Index a dragged tile would take in a group, from the pointer position
 *  measured from the group's start (including its scroll offset). */
export function dropIndex(posInGroup: number, count: number, tile = DOCK_TILE): number {
  const step = tile + DOCK_GAP;
  return Math.max(0, Math.min(count, Math.round(posInGroup / step)));
}

/** Move `id` to `index` in `ids` (index counted in the list WITHOUT `id`). */
export function moveTo(ids: string[], id: string, index: number): string[] {
  const rest = ids.filter((x) => x !== id);
  const i = Math.max(0, Math.min(rest.length, index));
  return [...rest.slice(0, i), id, ...rest.slice(i)];
}

/** Motion: ease-out, no overshoot. Collapse is a little faster than expand. */
export const DOCK_MOTION = {
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  expandMs: 260,
  collapseMs: 190,
};

export type DockPosition = { edge: DockEdge; align: DockAlign };

export const DOCK_POSITIONS: readonly (DockPosition & { label: string })[] = [
  { edge: 'bottom', align: 'center', label: 'Bottom' },
  { edge: 'top', align: 'center', label: 'Top' },
  { edge: 'left', align: 'center', label: 'Left' },
  { edge: 'right', align: 'center', label: 'Right' },
  { edge: 'top', align: 'start', label: 'Top left' },
  { edge: 'top', align: 'end', label: 'Top right' },
  { edge: 'bottom', align: 'start', label: 'Bottom left' },
  { edge: 'bottom', align: 'end', label: 'Bottom right' },
  { edge: 'left', align: 'start', label: 'Left top' },
  { edge: 'left', align: 'end', label: 'Left bottom' },
  { edge: 'right', align: 'start', label: 'Right top' },
  { edge: 'right', align: 'end', label: 'Right bottom' },
];

export function dockPositionAt(area: WorkArea, x: number, y: number): DockPosition {
  const { desktop } = area;
  const left = x - desktop.x;
  const right = desktop.x + desktop.w - x;
  const top = y - desktop.y;
  const bottom = desktop.y + desktop.h - y;
  const corner = Math.min(desktop.w, desktop.h) * 0.24;
  if (Math.min(left, right) < corner && Math.min(top, bottom) < corner) {
    const side = Math.min(left, right);
    const end = Math.min(top, bottom);
    // Hugging a side edge, clearly away from the top/bottom edge: a vertical
    // Dock at that end of the side. Otherwise the horizontal corner.
    if (side * 2 < end) return { edge: left < right ? 'left' : 'right', align: top < bottom ? 'start' : 'end' };
    return { edge: top < bottom ? 'top' : 'bottom', align: left < right ? 'start' : 'end' };
  }

  const nearest = Math.min(left, right, top, bottom);
  const edge = nearest === top ? 'top' : nearest === bottom ? 'bottom' : nearest === left ? 'left' : 'right';
  return { edge, align: 'center' };
}
