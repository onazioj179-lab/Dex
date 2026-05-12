// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// PRISM/FLUX image-processing web worker (T6-018).
// Off-loads pixel-bound work from the renderer main thread so brush, scrub
// and live preview stay responsive during heavy filter passes.
// =============================================================================

import * as Adj from './PrismAdjustments';

// Operation -> dispatcher. Each handler returns the result ImageData.
// Kept as a typed lookup so unknown ops fail fast without dynamic eval.
type Handler = (img: ImageData, params: Record<string, unknown>) => ImageData;

const handlers: Record<string, Handler> = {
  brightnessContrast: (img, p) => Adj.adjustBrightnessContrast(
    img,
    Number(p.brightness ?? 0),
    Number(p.contrast ?? 0),
    Boolean(p.useLegacy ?? false),
  ),
  exposure: (img, p) => Adj.adjustExposure(
    img,
    Number(p.stops ?? p.exposure ?? 0),
    Number(p.offset ?? 0),
    Number(p.gamma ?? 1),
  ),
  vibrance: (img, p) => Adj.adjustVibrance(
    img,
    Number(p.vibrance ?? 0),
    Number(p.saturation ?? 0),
  ),
  invert: (img) => Adj.invert(img),
  posterize: (img, p) => Adj.posterize(img, Number(p.levels ?? 4)),
  threshold: (img, p) => Adj.threshold(img, Number(p.level ?? 128)),
};

interface RequestMsg {
  id: number;
  op: string;
  imageData: ImageData;
  params?: Record<string, unknown>;
}

interface ResponseMsg {
  id: number;
  ok: boolean;
  imageData?: ImageData;
  error?: string;
}

self.onmessage = (e: MessageEvent<RequestMsg>) => {
  const { id, op, imageData, params } = e.data;
  const handler = handlers[op];
  if (!handler) {
    const res: ResponseMsg = { id, ok: false, error: `Unknown op: ${op}` };
    (self as unknown as Worker).postMessage(res);
    return;
  }
  try {
    const result = handler(imageData, params ?? {});
    const res: ResponseMsg = { id, ok: true, imageData: result };
    // Transfer the underlying buffer to avoid a copy on the way back.
    (self as unknown as Worker).postMessage(res, [result.data.buffer]);
  } catch (err) {
    const res: ResponseMsg = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(res);
  }
};

export {}; // module worker
