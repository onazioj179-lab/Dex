// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus dashboard view-model (the memory-first sidebar + overview). Composes the
 * memory views, degree-centrality hubs, tag cloud and graph stats into one
 * structure the Nexus UI renders — the integration layer that makes those pure
 * modules load-bearing. Pure: no DOM, no IO.
 */

import type { NexusModel, NexusEntity, NexusEntityKind } from './model';
import { NEXUS_MEMORY_VIEWS } from './memoryViews';
import { topHubs } from './centrality';
import { tagCloud, type TagCount } from './tagIndex';
import { graphStats, type GraphStats } from './graphStats';

// Memory-view id (plural) → entity kind (singular).
const VIEW_KIND: Record<string, NexusEntityKind> = {
  projects: 'project', ideas: 'idea', people: 'person', files: 'file',
  assets: 'asset', sessions: 'session', research: 'research', conversations: 'conversation',
};

export interface ViewCount {
  id: string;
  label: string;
  icon: string;
  count: number;
}

export interface NexusDashboard {
  views: ViewCount[];
  hubs: NexusEntity[];
  tags: TagCount[];
  stats: GraphStats;
  totalEntities: number;
}

/** Build the Nexus overview view-model from a memory model. */
export function nexusDashboard(model: NexusModel, hubCount = 5): NexusDashboard {
  const views: ViewCount[] = NEXUS_MEMORY_VIEWS.map((v) => ({
    id: v.id,
    label: v.label,
    icon: v.icon,
    count: VIEW_KIND[v.id] ? model.byKind(VIEW_KIND[v.id]).length : 0,
  }));

  return {
    views,
    hubs: topHubs(model, hubCount),
    tags: tagCloud(model),
    stats: graphStats(model),
    totalEntities: model.entityCount(),
  };
}
