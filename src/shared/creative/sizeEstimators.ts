// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Ready-made `sizeOf` estimators for `SnapshotHistory`'s memory budget. Creative
 * apps hold different snapshot shapes — raw image buffers (Canvas/Prism), JSON
 * scene graphs (Forge/AXL), plain text (Notes) — so each needs a cheap, roughly
 * accurate byte estimate to feed `maxBytes`. These are deliberate *estimates*
 * (no deep traversal of huge buffers); they only need to track memory growth
 * well enough for the eviction policy to keep the stack bounded. Pure.
 */

/** JS strings are UTF-16 internally: ~2 bytes per code unit. */
export function estimateStringBytes(s: string): number {
  return s.length * 2;
}

/**
 * Raw pixel buffer size: width × height × channels (default 4 = RGBA, 1 byte
 * each). Matches the backing store of an `ImageData`/canvas snapshot regardless
 * of whether the snapshot also carries metadata.
 */
export function estimateImageBytes(
  dims: { width: number; height: number },
  channels = 4,
): number {
  const w = Math.max(0, Math.floor(dims.width || 0));
  const h = Math.max(0, Math.floor(dims.height || 0));
  return w * h * Math.max(1, Math.floor(channels));
}

/** Byte length of a typed array / ArrayBuffer-backed view. */
export function estimateBufferBytes(buf: ArrayBufferView | ArrayBuffer): number {
  if (buf instanceof ArrayBuffer) return buf.byteLength;
  return buf.byteLength;
}

/**
 * Serialized-JSON estimate (≈ 2 bytes per character of `JSON.stringify`).
 * Returns 0 for values that can't be serialized (cycles, BigInt) — callers get
 * a safe under-estimate rather than a throw.
 */
export function estimateJsonBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json ? json.length * 2 : 0;
  } catch {
    return 0;
  }
}

/**
 * Best-effort dispatcher: picks the most fitting estimator for a snapshot.
 * - string                       → UTF-16 byte estimate
 * - ArrayBuffer / typed array    → exact byteLength
 * - { data, width, height }      → image pixel-buffer estimate (Canvas/Prism)
 * - { width, height }            → image dims estimate
 * - anything else (objects)      → JSON estimate
 * - null/undefined/number/bool   → 0 (negligible)
 */
export function estimateBytes(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string') return estimateStringBytes(value);
  if (typeof value !== 'object') return 0;

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return estimateBufferBytes(value as ArrayBufferView);
  }

  const obj = value as Record<string, unknown>;
  if (typeof obj.width === 'number' && typeof obj.height === 'number') {
    // An ImageData-like payload: prefer its real buffer length when present.
    const data = obj.data;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data as object)) {
      return estimateBufferBytes(data as ArrayBufferView);
    }
    return estimateImageBytes({ width: obj.width, height: obj.height });
  }

  return estimateJsonBytes(value);
}
