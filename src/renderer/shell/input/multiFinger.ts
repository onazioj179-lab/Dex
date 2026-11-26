// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Multi-finger gestures (3 to 10 fingers) for touch screens.
 *
 * One gesture per touch session, decided when the last finger lifts from the
 * whole session (every finger's start and end), so it never fires twice and
 * never fights the live 2- and 3-finger gestures:
 *   tap      : short, every finger nearly still;
 *   swipe    : the fingers moved together far enough (left/right/up/down);
 *   pinch    : fingers closed toward their centre (spread = opened).
 * The mapping from gesture to action is the user's (Settings › Touch & Pen),
 * with Mac-like defaults.
 */

export interface Contact { sx: number; sy: number; ex: number; ey: number }
export type MultiKind = 'tap' | 'swipe-left' | 'swipe-right' | 'swipe-up' | 'swipe-down' | 'pinch' | 'spread';
export interface MultiGesture { fingers: number; kind: MultiKind }

export const TAP_MAX_MS = 350;
export const TAP_MAX_MOVE = 18;
export const SWIPE_MIN = 70;
/** Pinch/spread: the average distance to the centre changes by this factor. */
export const PINCH_RATIO = 0.3;

const centre = (pts: Array<{ x: number; y: number }>) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});
const spreadOf = (pts: Array<{ x: number; y: number }>) => {
  const c = centre(pts);
  return pts.reduce((s, p) => s + Math.hypot(p.x - c.x, p.y - c.y), 0) / pts.length;
};

/** Classify a finished touch session, or null when it is not a multi-finger gesture. */
export function classifyMultiTouch(contacts: Contact[], durationMs: number): MultiGesture | null {
  const n = contacts.length;
  if (n < 3 || n > 10) return null;
  const moves = contacts.map((c) => Math.hypot(c.ex - c.sx, c.ey - c.sy));
  if (durationMs <= TAP_MAX_MS && Math.max(...moves) <= TAP_MAX_MOVE) return { fingers: n, kind: 'tap' };
  const start = contacts.map((c) => ({ x: c.sx, y: c.sy }));
  const end = contacts.map((c) => ({ x: c.ex, y: c.ey }));
  const s0 = spreadOf(start), s1 = spreadOf(end);
  if (s0 > 10) {
    const change = (s1 - s0) / s0;
    if (change <= -PINCH_RATIO) return { fingers: n, kind: 'pinch' };
    if (change >= PINCH_RATIO) return { fingers: n, kind: 'spread' };
  }
  const c0 = centre(start), c1 = centre(end);
  const dx = c1.x - c0.x, dy = c1.y - c0.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return { fingers: n, kind: dx > 0 ? 'swipe-right' : 'swipe-left' };
  return { fingers: n, kind: dy > 0 ? 'swipe-down' : 'swipe-up' };
}

export type GestureAction =
  | 'none' | 'ask-uki' | 'search' | 'app-menu' | 'overview' | 'show-desktop' | 'clipboard'
  | 'next-app' | 'previous-app' | 'close-app' | 'notifications' | 'screenshot';

export const GESTURE_ACTIONS: Array<{ id: GestureAction; label: string }> = [
  { id: 'none', label: 'Nothing' },
  { id: 'ask-uki', label: 'Ask UKI' },
  { id: 'search', label: 'Search' },
  { id: 'app-menu', label: 'App Menu' },
  { id: 'overview', label: 'Show all windows' },
  { id: 'show-desktop', label: 'Show the desktop' },
  { id: 'clipboard', label: 'Clipboard history' },
  { id: 'next-app', label: 'Next app' },
  { id: 'previous-app', label: 'Previous app' },
  { id: 'close-app', label: 'Close the app' },
  { id: 'notifications', label: 'Notifications' },
];

/** Gestures offered in Settings, in order. 3-finger swipes stay with the live recogniser. */
export const GESTURE_SLOTS: string[] = [
  '3-tap', '4-tap', '5-tap',
  '4-swipe-left', '4-swipe-right', '4-swipe-up', '4-swipe-down',
  '5-pinch', '5-spread', '5-swipe-up', '5-swipe-down',
  '6-tap', '7-tap', '8-tap', '9-tap', '10-tap', '10-pinch',
];

/** Mac-like defaults: 4-finger swipes move between apps / show everything, 5-finger pinch = launcher. */
export const DEFAULT_GESTURE_MAP: Record<string, GestureAction> = {
  '3-tap': 'ask-uki',
  '4-tap': 'search',
  '5-tap': 'clipboard',
  '4-swipe-left': 'next-app',
  '4-swipe-right': 'previous-app',
  '4-swipe-up': 'overview',
  '4-swipe-down': 'show-desktop',
  '5-pinch': 'app-menu',
  '5-spread': 'show-desktop',
  '5-swipe-up': 'notifications',
  '5-swipe-down': 'show-desktop',
  '10-tap': 'show-desktop',
  '10-pinch': 'close-app',
};

const KEY = 'dex-multitouch-map';
const VALID = new Set(GESTURE_ACTIONS.map((a) => a.id));

export function slotOf(g: MultiGesture): string { return `${g.fingers}-${g.kind}`; }

export function readGestureMap(): Record<string, GestureAction> {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') ?? {}; } catch { /* defaults */ }
  const out: Record<string, GestureAction> = { ...DEFAULT_GESTURE_MAP };
  for (const [k, v] of Object.entries(saved)) if (typeof v === 'string' && VALID.has(v as GestureAction)) out[k] = v as GestureAction;
  return out;
}

export function writeGestureMap(map: Record<string, GestureAction>): void {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* storage unavailable */ }
}

export function actionFor(g: MultiGesture, map = readGestureMap()): GestureAction {
  return map[slotOf(g)] ?? 'none';
}

export function describeSlot(slot: string): string {
  const [n, ...rest] = slot.split('-');
  const kind = rest.join('-');
  const what: Record<string, string> = {
    tap: 'tap', pinch: 'pinch in', spread: 'spread out',
    'swipe-left': 'swipe left', 'swipe-right': 'swipe right', 'swipe-up': 'swipe up', 'swipe-down': 'swipe down',
  };
  return `${n}-finger ${what[kind] ?? kind}`;
}
