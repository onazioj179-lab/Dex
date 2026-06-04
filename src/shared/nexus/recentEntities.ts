// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Recent entities (Nexus "Recent" rail, Home Mission Control "pick up where you
 * left off"). Returns the most-recently-touched entities across all memory
 * kinds, optionally filtered. Pure: no DOM, no IO.
 */

import type { NexusModel, NexusEntity, NexusEntityKind } from './model';

const ALL_KINDS: NexusEntityKind[] =
  ['project', 'idea', 'person', 'file', 'asset', 'session', 'research', 'conversation'];

/** Most-recently-touched entities across all kinds, newest first. */
export function recentEntities(model: NexusModel, limit = 10): NexusEntity[] {
  const all: NexusEntity[] = [];
  for (const k of ALL_KINDS) all.push(...model.byKind(k));
  return all.sort((a, b) => b.ts - a.ts).slice(0, Math.max(0, limit));
}

/** Most-recent entities of specific kinds (e.g. projects + sessions for Home). */
export function recentOfKinds(model: NexusModel, kinds: readonly NexusEntityKind[], limit = 10): NexusEntity[] {
  const all: NexusEntity[] = [];
  for (const k of kinds) all.push(...model.byKind(k));
  return all.sort((a, b) => b.ts - a.ts).slice(0, Math.max(0, limit));
}

/** Entities touched at/after `sinceTs`, newest first. */
export function entitiesSince(model: NexusModel, sinceTs: number): NexusEntity[] {
  return recentEntities(model, Infinity).filter((e) => e.ts >= sinceTs);
}
