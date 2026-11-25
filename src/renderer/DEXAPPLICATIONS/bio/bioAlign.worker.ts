// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/** Runs a Bio Studio alignment off the UI thread (a 5,000 x 5,000 job takes about a second). */
import { alignPairwise, type AlignOptions } from './bioAlign';

self.onmessage = (e: MessageEvent<{ id: number; a: string; b: string; opts: AlignOptions }>) => {
  const { id, a, b, opts } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, ok: true, result: alignPairwise(a, b, opts) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: (err as Error).message });
  }
};
