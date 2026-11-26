// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * "Paste any key": find the provider a key belongs to. Unambiguous prefixes
 * decide at once; otherwise each candidate's model list is requested with the
 * key and the first that accepts it wins. The key only goes to those
 * providers' own endpoints.
 */

import { getProvider } from './registry';
import { providersForKey } from './compatible';
import type { ProviderId } from './types';

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number }>;

export async function identifyKey(key: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)): Promise<ProviderId | null> {
  const candidates = providersForKey(key);
  if (candidates.length === 1) return candidates[0];
  for (const id of candidates) {
    const p = getProvider(id);
    if (!p?.buildModelsRequest) continue;
    const req = p.buildModelsRequest({ apiKey: key.trim() });
    try {
      const res = await fetchImpl(req.url, { method: req.method, headers: req.headers });
      if (res.ok) return id;
    } catch { /* unreachable: try the next */ }
  }
  return null;
}
