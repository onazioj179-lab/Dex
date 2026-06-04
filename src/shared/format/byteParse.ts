// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Byte-size parsing — the inverse of `format/units.formatBytes`. Parses "1.5 MB",
 * "500kb", "2 GiB", "1024" into a byte count, so settings (cache caps, retention
 * budgets, upload limits) can accept friendly text. Binary units (1024). Pure.
 */

const UNIT_BYTES: Record<string, number> = {
  b: 1,
  kb: 1024, kib: 1024,
  mb: 1024 ** 2, mib: 1024 ** 2,
  gb: 1024 ** 3, gib: 1024 ** 3,
  tb: 1024 ** 4, tib: 1024 ** 4,
  pb: 1024 ** 5, pib: 1024 ** 5,
};

const RE = /^([\d.]+)\s*([a-z]+)?$/i;

/** Parse a size string to bytes. Bare number → bytes. Null when invalid. */
export function parseBytes(input: string): number | null {
  const str = input.trim().toLowerCase();
  const m = str.match(RE);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = m[2];
  if (!unit) return Math.round(value); // bare number = bytes
  const factor = UNIT_BYTES[unit];
  if (factor === undefined) return null;
  return Math.round(value * factor);
}

/** Parse to bytes, or fall back to a default when invalid. */
export function parseBytesOr(input: string, fallback: number): number {
  const v = parseBytes(input);
  return v === null ? fallback : v;
}
