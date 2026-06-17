// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * App-context resolver. UKI prompts always need to know "what is the user
 * looking at right now?" — this module abstracts that lookup via a
 * registry of per-app resolvers. Pure functions; each app supplies its
 * resolver at startup.
 */

// DEX v3.8.9 - UKI brain: app context

export interface AppContextSnapshot {
  appId: string;
  /** Currently focused item (file id, note id, scene id, etc). */
  focusedItemId?: string;
  /** Active selection text (if any). */
  selectionText?: string;
  /** Current open file path / URI. */
  currentFile?: string;
  /** Viewport / scroll position descriptor. */
  viewport?: { width?: number; height?: number; scrollTop?: number };
  /** App-specific extras. */
  custom?: Record<string, unknown>;
}

export type AppContextResolverFn = () => AppContextSnapshot | undefined;

export interface AppContextResolver {
  resolvers: Map<string, AppContextResolverFn>;
}

export function createAppContextResolver(): AppContextResolver {
  return { resolvers: new Map() };
}

export function registerAppContext(
  reg: AppContextResolver,
  appId: string,
  fn: AppContextResolverFn,
): void {
  if (!appId) throw new Error('appId required');
  reg.resolvers.set(appId, fn);
}

export function unregisterAppContext(reg: AppContextResolver, appId: string): boolean {
  return reg.resolvers.delete(appId);
}

/** Resolve the snapshot for one app, or undefined if no resolver. */
export function resolveAppContext(reg: AppContextResolver, appId: string): AppContextSnapshot | undefined {
  const fn = reg.resolvers.get(appId);
  if (!fn) return undefined;
  try { return fn(); } catch { return undefined; }
}

/** Resolve all registered apps. */
export function resolveAllAppContexts(reg: AppContextResolver): AppContextSnapshot[] {
  const out: AppContextSnapshot[] = [];
  for (const [appId, fn] of reg.resolvers) {
    try { const snap = fn(); if (snap) out.push(snap); } catch { /* skip */ }
  }
  return out;
}

/**
 * Render a snapshot as a compact prompt block. Bounded length so a noisy
 * app cannot blow the token budget.
 */
export function formatContextForPrompt(snap: AppContextSnapshot, maxChars = 800): string {
  const lines: string[] = [`app: ${snap.appId}`];
  if (snap.currentFile) lines.push(`file: ${truncate(snap.currentFile, 200)}`);
  if (snap.focusedItemId) lines.push(`focus: ${truncate(snap.focusedItemId, 120)}`);
  if (snap.selectionText) lines.push(`selection:\n${truncate(snap.selectionText, 400)}`);
  if (snap.custom) {
    for (const [k, v] of Object.entries(snap.custom)) {
      // Skip empty extras: undefined/null/'' values should never produce a noisy
      // "key:" line -- and never reach truncate(undefined). JSON.stringify returns
      // undefined for an undefined input, which previously threw here and broke
      // the whole uki prompt the moment any resolver supplied an undefined extra.
      if (v === undefined || v === null || v === '') continue;
      lines.push(`${k}: ${truncate(stringify(v), 120)}`);
    }
  }
  const joined = lines.join('\n');
  return joined.length > maxChars ? joined.slice(0, maxChars - 1) + '…' : joined;
}

import { truncate } from '../util/text';
function stringify(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v) ?? ''; } catch { return String(v); }
}
