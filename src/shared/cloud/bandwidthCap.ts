// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bandwidth caps for cloud sync, per direction (upload / download).
 */

// DEX v3.8.9 - bandwidth caps

export interface BandwidthCap {
  uploadKBps: number;       // 0 = unlimited
  downloadKBps: number;
  /** Optional time window when caps apply (e.g. work hours). */
  windowHours?: { start: number; end: number };
}

export function defaultBandwidthCap(): BandwidthCap {
  return { uploadKBps: 0, downloadKBps: 0 };
}

export function inWindow(now: Date, w?: { start: number; end: number }): boolean {
  if (!w) return true;
  const h = now.getHours();
  if (w.start <= w.end) return h >= w.start && h < w.end;
  return h >= w.start || h < w.end;   // wrap (e.g. 22..6)
}

/** Returns the effective cap for the given direction, in kB/s; Infinity = unlimited. */
export function effectiveCapKBps(cap: BandwidthCap, dir: 'upload' | 'download', now: Date = new Date()): number {
  if (!inWindow(now, cap.windowHours)) return Infinity;
  const v = dir === 'upload' ? cap.uploadKBps : cap.downloadKBps;
  return v > 0 ? v : Infinity;
}

/** How long, in ms, the next chunk should wait given a cap and chunk size. */
export function pacingDelayMs(cap: BandwidthCap, dir: 'upload' | 'download', chunkBytes: number, now: Date = new Date()): number {
  const kb = effectiveCapKBps(cap, dir, now);
  if (kb === Infinity || kb <= 0) return 0;
  const seconds = chunkBytes / 1024 / kb;
  return Math.max(0, Math.round(seconds * 1000));
}
