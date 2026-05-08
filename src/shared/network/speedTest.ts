// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Pure helpers for the DEX network speed test. No fetch, no Node, no DOM —
// the actual byte-shovelling lives in src/main/services/SpeedTestService.ts
// (Node side) and the renderer just calls it via IPC.
//
// These helpers are split out so the math (Mbps conversion, jitter, quality
// tier classification) is unit-testable without spinning up Electron.

export interface SpeedSample {
  /** Bytes downloaded / uploaded for this sample. */
  bytes: number;
  /** Wall-clock duration of the sample in milliseconds. */
  durationMs: number;
}

export type SpeedQuality = 'offline' | 'poor' | 'fair' | 'good' | 'excellent';

export interface SpeedTestResult {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  quality: SpeedQuality;
  /** ISO timestamp of when the test completed. */
  timestamp: string;
  /** Friendly server label / region used for the test. */
  server: string;
}

/**
 * Convert a sample to megabits-per-second.
 *  - 1 byte = 8 bits
 *  - Mbps reports decimal megabits (1e6), matching every consumer speed test.
 */
export function bytesPerMsToMbps(bytes: number, durationMs: number): number {
  if (durationMs <= 0 || bytes <= 0) return 0;
  const bits = bytes * 8;
  const seconds = durationMs / 1000;
  const bitsPerSecond = bits / seconds;
  return round2(bitsPerSecond / 1_000_000);
}

/**
 * Aggregate multiple samples (e.g. parallel HTTP streams) into a single Mbps.
 * Drops the slowest sample as a coarse outlier filter when 3+ samples exist.
 */
export function aggregateSamples(samples: SpeedSample[]): number {
  const valid = samples.filter((s) => s.bytes > 0 && s.durationMs > 0);
  if (valid.length === 0) return 0;
  const mbpsList = valid.map((s) => bytesPerMsToMbps(s.bytes, s.durationMs));
  const sorted = [...mbpsList].sort((a, b) => a - b);
  const trimmed = sorted.length >= 3 ? sorted.slice(1) : sorted;
  const sum = trimmed.reduce((acc, v) => acc + v, 0);
  return round2(sum / trimmed.length);
}

/** Compute jitter (mean absolute deviation between consecutive ping samples). */
export function computeJitter(pingsMs: number[]): number {
  const valid = pingsMs.filter((p) => p > 0);
  if (valid.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < valid.length; i++) {
    total += Math.abs(valid[i] - valid[i - 1]);
  }
  return round2(total / (valid.length - 1));
}

/**
 * Map a download speed (Mbps) to a friendly quality label.
 * Thresholds aimed at typical consumer expectations:
 *   < 1   Mbps -> offline-class (cellular dropout, basically unusable)
 *   < 10        -> poor (web pages slow, video buffers)
 *   < 25        -> fair (HD video OK, 4K struggles)
 *   < 100       -> good (4K + multitasking)
 *   >=100       -> excellent
 */
export function classifySpeed(downloadMbps: number): SpeedQuality {
  if (!Number.isFinite(downloadMbps) || downloadMbps < 1) return 'offline';
  if (downloadMbps < 10) return 'poor';
  if (downloadMbps < 25) return 'fair';
  if (downloadMbps < 100) return 'good';
  return 'excellent';
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
