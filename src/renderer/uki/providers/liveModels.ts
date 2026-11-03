// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Live model catalogs. Hosted providers retire models; a hard-coded list goes
 * stale and then every request 404s. When the user has a key, ask the provider
 * which models the account can use and remember the answer (localStorage, so
 * the next session shows it without a request). Static lists stay as the
 * fallback.
 *
 * Network only when asked (AI settings opened, key saved). Never at launch.
 */

import type { LLMProvider, ModelInfo, ProviderConfig } from './types';

const STORAGE_KEY = 'dex-uki-live-models';
export const LIVE_MODELS_EVENT = 'dex-uki-models-changed';

let cache: Record<string, ModelInfo[]> | null = null;

function load(): Record<string, ModelInfo[]> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    cache = raw && typeof raw === 'object' ? raw : {};
  } catch {
    cache = {};
  }
  return cache!;
}

/** The provider's live list, or null when it has never been fetched. */
export function liveModels(providerId: string): ModelInfo[] | null {
  const list = load()[providerId];
  return Array.isArray(list) && list.length > 0 ? list : null;
}

export function setLiveModels(providerId: string, models: ModelInfo[]): void {
  const all = load();
  if (models.length > 0) all[providerId] = models;
  else delete all[providerId];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new CustomEvent(LIVE_MODELS_EVENT, { detail: { providerId } })); } catch { /* no window */ }
}

/** Forget a provider's live list (key removed). */
export function clearLiveModels(providerId: string): void {
  setLiveModels(providerId, []);
}

/**
 * Fetch and store the provider's model list. Returns the number of models, or
 * null when the provider can't list models or the request failed (the static
 * fallback stays in place either way).
 */
export async function refreshLiveModels(
  provider: LLMProvider,
  config: ProviderConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  if (!provider.buildModelsRequest || !provider.parseModels) return null;
  if (provider.requiresKey && !config.apiKey) return null;
  try {
    const req = provider.buildModelsRequest(config);
    const res = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body });
    if (!res.ok) return null;
    const models = provider.parseModels(await res.json());
    if (models.length === 0) return null;
    setLiveModels(provider.id, models);
    return models.length;
  } catch {
    return null;
  }
}

/** Tests only. */
export function _resetLiveModelsForTests(): void {
  cache = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
