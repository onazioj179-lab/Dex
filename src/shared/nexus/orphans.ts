// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus orphan detection (NEX — graph hygiene, "unlinked" surfacing, GC hints).
 * Finds entities with no relations in either direction. Pure: no DOM, no IO.
 */

import type { NexusModel, NexusEntity, NexusEntityKind } from './model';

const ALL_KINDS: NexusEntityKind[] =
  ['project', 'idea', 'person', 'file', 'asset', 'session', 'research', 'conversation'];

function allEntities(model: NexusModel): NexusEntity[] {
  const out: NexusEntity[] = [];
  for (const k of ALL_KINDS) out.push(...model.byKind(k));
  return out;
}

/** Entities with zero in- and out-relations, oldest-touched first (best GC). */
export function findOrphans(model: NexusModel): NexusEntity[] {
  const entities = allEntities(model);
  const hasIncoming = new Set<string>();
  for (const e of entities) {
    for (const rel of model.relationsFrom(e.id)) hasIncoming.add(rel.to);
  }
  return entities
    .filter((e) => model.relationsFrom(e.id).length === 0 && !hasIncoming.has(e.id))
    .sort((a, b) => a.ts - b.ts);
}

/** Count of orphaned entities. */
export function orphanCount(model: NexusModel): number {
  return findOrphans(model).length;
}

/** True when the entity has no relations in either direction. */
export function isOrphan(model: NexusModel, id: string): boolean {
  if (!model.hasEntity(id)) return false;
  if (model.relationsFrom(id).length > 0) return false;
  for (const e of allEntities(model)) {
    if (model.relationsFrom(e.id).some((r) => r.to === id)) return false;
  }
  return true;
}
