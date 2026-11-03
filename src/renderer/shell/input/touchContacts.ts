// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Multitouch core: tracks simultaneous touch/pen contacts by their stable
// pointerId (up to MAX_CONTACTS, never more than the hardware reports) and
// turns any number of fingers into one pan / pinch / rotate delta, so a
// three- or five-finger drag behaves like a two-finger one instead of freezing.
//
// Pure: no DOM listeners here. GestureRecognizer (utils/TouchInputSystem) and
// the spatial canvas feed it pointer events.
//

export const MAX_CONTACTS = 10;
/** Contact area (CSS px^2) above which a touch is treated as a palm while a pen is in use. */
export const PALM_AREA = 400;

export interface Pt { x: number; y: number }

export interface PointerSample {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  isPrimary?: boolean;
  width?: number;
  height?: number;
  pressure?: number;
  timeStamp?: number;
}

export interface Contact {
  id: number;
  type: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  t0: number;
  pressure: number;
}

export interface MultiDelta {
  /** Contacts that took part (present before and after the move). */
  count: number;
  /** Centroid before the move (the pivot for scale/rotation). */
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  /** Spread ratio (next / prev); 1 with a single contact. */
  scale: number;
  /** Radians, counter-clockwise positive in screen space; 0 with a single contact. */
  rotation: number;
}

const centroid = (pts: Pt[]): Pt => {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
};

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

/**
 * Similarity transform between two samples of the same contacts (same order):
 * translation of the centroid, ratio of the mean distance to the centroid, and
 * the mean angle change about it. Works for 1..N contacts.
 */
export function multiDelta(prev: Pt[], next: Pt[]): MultiDelta {
  const n = Math.min(prev.length, next.length);
  if (n === 0) return { count: 0, cx: 0, cy: 0, dx: 0, dy: 0, scale: 1, rotation: 0 };
  const a = prev.slice(0, n), b = next.slice(0, n);
  const c0 = centroid(a), c1 = centroid(b);
  if (n === 1) return { count: 1, cx: c0.x, cy: c0.y, dx: c1.x - c0.x, dy: c1.y - c0.y, scale: 1, rotation: 0 };
  let s0 = 0, s1 = 0, rot = 0, w = 0;
  for (let i = 0; i < n; i++) {
    const ax = a[i].x - c0.x, ay = a[i].y - c0.y;
    const bx = b[i].x - c1.x, by = b[i].y - c1.y;
    const r0 = Math.hypot(ax, ay), r1 = Math.hypot(bx, by);
    s0 += r0; s1 += r1;
    // Weight each contact's angle change by its radius: a finger sitting on the
    // centroid has no meaningful angle.
    const wt = Math.min(r0, r1);
    if (wt > 0.5) { rot += wrapAngle(Math.atan2(by, bx) - Math.atan2(ay, ax)) * wt; w += wt; }
  }
  return {
    count: n, cx: c0.x, cy: c0.y, dx: c1.x - c0.x, dy: c1.y - c0.y,
    scale: s0 > 0.5 ? s1 / s0 : 1,
    rotation: w > 0 ? rot / w : 0,
  };
}

/** Tracks active contacts. One instance per surface that cares about touch. */
export class ContactTracker {
  private contacts = new Map<number, Contact>();
  private peak = 0;
  constructor(private readonly limit: number = MAX_CONTACTS) {}

  get count(): number { return this.contacts.size; }
  /** Most contacts seen at once since the last reset (for diagnostics). */
  get peakCount(): number { return this.peak; }
  list(): Contact[] { return Array.from(this.contacts.values()); }
  has(id: number): boolean { return this.contacts.has(id); }
  get(id: number): Contact | undefined { return this.contacts.get(id); }

  /**
   * Adds a contact. Returns it, or null when it is ignored (over the limit, or
   * rejected as a palm). A primary touch pointer means no other touch is down
   * (Pointer Events spec), so any touch contacts still tracked are stale (their
   * pointerup was lost) and are dropped first.
   */
  down(e: PointerSample, opts: { rejectPalm?: boolean } = {}): Contact | null {
    if (e.pointerType === 'touch' && e.isPrimary) {
      for (const [id, c] of this.contacts) if (c.type === 'touch') this.contacts.delete(id);
    }
    if (opts.rejectPalm && e.pointerType === 'touch' && (e.width || 1) * (e.height || 1) > PALM_AREA) return null;
    if (!this.contacts.has(e.pointerId) && this.contacts.size >= this.limit) return null;
    const c: Contact = {
      id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
      t0: e.timeStamp ?? Date.now(), pressure: e.pressure ?? 0,
    };
    this.contacts.set(e.pointerId, c);
    if (this.contacts.size > this.peak) this.peak = this.contacts.size;
    return c;
  }

  /** Moves a contact; returns the group delta over every tracked contact, or null if the pointer isn't tracked. */
  move(e: PointerSample): MultiDelta | null {
    const c = this.contacts.get(e.pointerId);
    if (!c) return null;
    const all = this.list();
    const prev = all.map((k) => ({ x: k.x, y: k.y }));
    c.x = e.clientX; c.y = e.clientY; c.pressure = e.pressure ?? c.pressure;
    const next = all.map((k) => ({ x: k.x, y: k.y }));
    return multiDelta(prev, next);
  }

  up(id: number): Contact | undefined {
    const c = this.contacts.get(id);
    this.contacts.delete(id);
    return c;
  }

  clear(): void { this.contacts.clear(); }
  resetPeak(): void { this.peak = this.contacts.size; }

  /** Total movement of the group since the gesture started (centroid of starts -> centroid now). */
  travel(): Pt {
    const all = this.list();
    if (!all.length) return { x: 0, y: 0 };
    const s = centroid(all.map((c) => ({ x: c.startX, y: c.startY })));
    const n = centroid(all.map((c) => ({ x: c.x, y: c.y })));
    return { x: n.x - s.x, y: n.y - s.y };
  }
}

export interface TouchCapabilities {
  /** Simultaneous contacts the hardware reports (navigator.maxTouchPoints); 0 = no touch screen. */
  maxTouchPoints: number;
  /** Contacts DEX will track at once: min(hardware, MAX_CONTACTS). */
  trackedContacts: number;
  /** The primary pointer is coarse (a touch-first device). */
  coarsePrimary: boolean;
  /** Any connected pointer is coarse (a touch screen alongside a mouse). */
  anyCoarse: boolean;
  /** The primary pointer can hover (mouse / trackpad / pen). */
  hover: boolean;
}

export function touchCapabilities(): TouchCapabilities {
  const max = typeof navigator !== 'undefined' && Number.isFinite(navigator.maxTouchPoints) ? Math.max(0, navigator.maxTouchPoints) : 0;
  const mq = (q: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  return {
    maxTouchPoints: max,
    trackedContacts: Math.min(max, MAX_CONTACTS),
    coarsePrimary: mq('(pointer: coarse)'),
    anyCoarse: mq('(any-pointer: coarse)'),
    hover: mq('(hover: hover)'),
  };
}
