// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Client wrapper for the PRISM image-processing worker (T6-018).
// Use `runInWorker(op, imageData, params)` to off-load filters.
// Falls back to in-thread execution if Workers are unavailable, the worker
// fails to spawn, or the op is unknown to the worker bundle.
// =============================================================================

import * as Adj from './PrismAdjustments';

interface PendingResolver {
  resolve: (img: ImageData) => void;
  reject: (err: Error) => void;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, PendingResolver>();

function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(
      new URL('./imageProcessingWorker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (
      e: MessageEvent<{ id: number; ok: boolean; imageData?: ImageData; error?: string }>,
    ) => {
      const { id, ok, imageData, error } = e.data;
      const slot = pending.get(id);
      if (!slot) return;
      pending.delete(id);
      if (ok && imageData) {
        slot.resolve(imageData);
      } else {
        slot.reject(new Error(error || 'worker failure'));
      }
    };
    worker.onerror = () => {
      workerBroken = true;
      try { worker?.terminate(); } catch { /* ignore */ }
      worker = null;
      // Reject any in-flight calls so callers can fall back.
      for (const [, slot] of pending) slot.reject(new Error('worker crashed'));
      pending.clear();
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

// Inline fallbacks mirror the worker's handler table for graceful degradation.
const fallbacks: Record<string, (img: ImageData, p: Record<string, unknown>) => ImageData> = {
  brightnessContrast: (img, p) => Adj.adjustBrightnessContrast(
    img, Number(p.brightness ?? 0), Number(p.contrast ?? 0), Boolean(p.useLegacy ?? false),
  ),
  exposure: (img, p) => Adj.adjustExposure(
    img,
    Number(p.stops ?? p.exposure ?? 0),
    Number(p.offset ?? 0),
    Number(p.gamma ?? 1),
  ),
  vibrance: (img, p) => Adj.adjustVibrance(img, Number(p.vibrance ?? 0), Number(p.saturation ?? 0)),
  invert: (img) => Adj.invert(img),
  posterize: (img, p) => Adj.posterize(img, Number(p.levels ?? 4)),
  threshold: (img, p) => Adj.threshold(img, Number(p.level ?? 128)),
};

export async function runInWorker(
  op: string,
  imageData: ImageData,
  params: Record<string, unknown> = {},
): Promise<ImageData> {
  const w = ensureWorker();
  if (!w) {
    const fn = fallbacks[op];
    if (!fn) throw new Error(`Unknown op: ${op}`);
    return fn(imageData, params);
  }
  const id = nextId++;
  // Clone the buffer so the caller's ImageData stays usable after transfer.
  const cloned = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
  return new Promise<ImageData>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      w.postMessage(
        { id, op, imageData: cloned, params },
        [cloned.data.buffer],
      );
    } catch (err) {
      pending.delete(id);
      // Last-ditch in-thread fallback if postMessage rejects the payload.
      const fn = fallbacks[op];
      if (!fn) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      try { resolve(fn(imageData, params)); } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
  });
}

export function disposeImageWorker(): void {
  try { worker?.terminate(); } catch { /* ignore */ }
  worker = null;
  workerBroken = false;
  for (const [, slot] of pending) slot.reject(new Error('worker disposed'));
  pending.clear();
}
