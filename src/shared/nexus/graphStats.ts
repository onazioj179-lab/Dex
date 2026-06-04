// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus graph statistics (memory health, "how connected is this?" insight).
 * Node/edge counts, average out-degree and graph density. Pure: no DOM, no IO.
 */

import type { NexusModel, NexusEntity, NexusEntityKind } from './model';

const ALL_KINDS: NexusEntityKind[] =
  ['project', 'idea', 'person', 'file', 'asset', 'session', 'research', 'conversation'];

export interface GraphStats {
  nodes: number;
  edges: number;
  /** Edges / nodes (avg outgoing relations per node). */
  avgOutDegree: number;
  /** Edges / (n·(n−1)) — fraction of possible directed edges present (0..1). */
  density: number;
  /** Nodes with no relations either way. */
  orphans: number;
}

function allEntities(model: NexusModel): NexusEntity[] {
  const out: NexusEntity[] = [];
  for (const k of ALL_KINDS) out.push(...model.byKind(k));
  return out;
}

/** Compute summary statistics for the memory graph. */
export function graphStats(model: NexusModel): GraphStats {
  const entities = allEntities(model);
  const n = entities.length;
  let edges = 0;
  const hasIncoming = new Set<string>();
  const hasOutgoing = new Set<string>();

  for (const e of entities) {
    const rels = model.relationsFrom(e.id);
    edges += rels.length;
    if (rels.length > 0) hasOutgoing.add(e.id);
    for (const r of rels) hasIncoming.add(r.to);
  }

  const orphans = entities.filter((e) => !hasOutgoing.has(e.id) && !hasIncoming.has(e.id)).length;

  return {
    nodes: n,
    edges,
    avgOutDegree: n === 0 ? 0 : edges / n,
    density: n < 2 ? 0 : edges / (n * (n - 1)),
    orphans,
  };
}
