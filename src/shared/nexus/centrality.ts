// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus centrality (NEX) — rank memory entities by how connected they are, so
 * the views can surface the "hubs" of a project/graph. Degree centrality = in +
 * out relations. Pure: no DOM, no IO.
 */

import type { NexusModel, NexusEntity, NexusEntityKind } from './model';

const ALL_KINDS: NexusEntityKind[] =
  ['project', 'idea', 'person', 'file', 'asset', 'session', 'research', 'conversation'];

export interface CentralityScore {
  entity: NexusEntity;
  inDegree: number;
  outDegree: number;
  degree: number;
}

function allEntities(model: NexusModel): NexusEntity[] {
  const out: NexusEntity[] = [];
  for (const k of ALL_KINDS) out.push(...model.byKind(k));
  return out;
}

/** Degree-centrality scores for every entity, most-connected first. */
export function degreeCentrality(model: NexusModel): CentralityScore[] {
  const entities = allEntities(model);
  const inDeg = new Map<string, number>();

  // Tally in-degree by scanning everyone's outgoing relations.
  for (const e of entities) {
    for (const rel of model.relationsFrom(e.id)) {
      inDeg.set(rel.to, (inDeg.get(rel.to) ?? 0) + 1);
    }
  }

  return entities
    .map((entity) => {
      const outDegree = model.relationsFrom(entity.id).length;
      const inDegree = inDeg.get(entity.id) ?? 0;
      return { entity, inDegree, outDegree, degree: inDegree + outDegree };
    })
    .sort((a, b) => b.degree - a.degree || b.entity.ts - a.entity.ts);
}

/** The top `n` most-connected entities. */
export function topHubs(model: NexusModel, n = 5): NexusEntity[] {
  return degreeCentrality(model).slice(0, n).map((s) => s.entity);
}
