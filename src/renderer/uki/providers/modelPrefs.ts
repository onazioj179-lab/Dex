// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Per-provider preferred-model store. Lets the user choose which model a
 * configured provider should use (e.g. GPT-4o vs GPT-4o mini) instead of always
 * defaulting to the provider's first model. Plain localStorage — model ids are
 * not secrets. Pure + testable; the selection logic in `connect.ts` consults it.
 */

const PREFIX = 'dex-uki-model-';

export function getPreferredModel(providerId: string): string | null {
  try {
    return localStorage.getItem(PREFIX + providerId);
  } catch {
    return null;
  }
}

export function setPreferredModel(providerId: string, modelId: string): void {
  try {
    if (!modelId) { clearPreferredModel(providerId); return; }
    localStorage.setItem(PREFIX + providerId, modelId);
  } catch { /* storage unavailable */ }
}

export function clearPreferredModel(providerId: string): void {
  try { localStorage.removeItem(PREFIX + providerId); } catch { /* */ }
}
