// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Per-display DPI scaling + per-display window memory (DEX_FEATURE_BACKLOG 09).
 *
 * Mirrors Win32 Per-Monitor-v2 high-DPI behaviour: when a window crosses to a
 * display with a different scale factor, its SIZE is rescaled by the DPI ratio
 * (the `WM_DPICHANGED` "suggested rect"), and the shell remembers each window's
 * position PER DISPLAY so it returns to where the user last left it on that
 * monitor. Pure geometry + a small memory map — no OS calls; the shell's window
 * manager applies the results.
 */

export interface Rect { x: number; y: number; w: number; h: number; }

export interface DisplayInfo {
  id: string;
  /** DPI scale factor (1 = 96 DPI, 1.5 = 144 DPI, 2 = 192 DPI). */
  scale: number;
  /** The display's bounds in the virtual desktop coordinate space. */
  bounds: Rect;
}

/**
 * Rescale a window for a DPI change (Per-Monitor-v2). The window's SIZE scales by
 * `to.scale / from.scale`; its top-left is kept relative to the target display's
 * origin so it lands on the new monitor rather than drifting off-screen — the
 * essence of the `WM_DPICHANGED` suggested rect.
 */
export function rescaleForDisplay(win: Rect, from: DisplayInfo, to: DisplayInfo): Rect {
  const ratio = from.scale > 0 ? to.scale / from.scale : 1;
  const w = Math.round(win.w * ratio);
  const h = Math.round(win.h * ratio);
  // Keep the window's offset within its current display, scaled, then re-anchor
  // to the target display origin.
  const relX = win.x - from.bounds.x;
  const relY = win.y - from.bounds.y;
  const x = Math.round(to.bounds.x + relX * ratio);
  const y = Math.round(to.bounds.y + relY * ratio);
  return { x, y, w, h };
}

/** Convert CSS/logical pixels to physical device pixels for a display. */
export function logicalToPhysical(value: number, display: DisplayInfo): number {
  return Math.round(value * display.scale);
}

/** Convert physical device pixels to CSS/logical pixels for a display. */
export function physicalToLogical(value: number, display: DisplayInfo): number {
  return display.scale > 0 ? value / display.scale : value;
}

/** Which display contains a point (by bounds); null if none. */
export function displayAtPoint(displays: ReadonlyArray<DisplayInfo>, px: number, py: number): DisplayInfo | null {
  for (const d of displays) {
    if (px >= d.bounds.x && px < d.bounds.x + d.bounds.w && py >= d.bounds.y && py < d.bounds.y + d.bounds.h) {
      return d;
    }
  }
  return null;
}

/**
 * Per-display window position memory: remembers each window's bounds keyed by
 * (displayId, windowId), so a window returns to its last spot ON THAT MONITOR when
 * re-shown there. Serialisable for persistence.
 */
export class WindowMemory {
  private store = new Map<string, Rect>();

  private key(displayId: string, windowId: string): string {
    return `${displayId}::${windowId}`;
  }

  remember(displayId: string, windowId: string, bounds: Rect): void {
    this.store.set(this.key(displayId, windowId), { ...bounds });
  }

  recall(displayId: string, windowId: string): Rect | null {
    const r = this.store.get(this.key(displayId, windowId));
    return r ? { ...r } : null;
  }

  forget(displayId: string, windowId: string): void {
    this.store.delete(this.key(displayId, windowId));
  }

  toJSON(): Record<string, Rect> {
    return Object.fromEntries(this.store);
  }

  static fromJSON(data: Record<string, Rect>): WindowMemory {
    const m = new WindowMemory();
    for (const [k, v] of Object.entries(data)) m.store.set(k, { ...v });
    return m;
  }
}
