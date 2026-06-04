// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus memory-view selector (NEX-001 data layer, NEX-012). Joins the pure
 * `NexusModel` (entities/relations) to the `memoryViews` model so the memory-
 * first sidebar can render each primary view (Projects / Ideas / People / … )
 * with a live count and a recent-entity preview — without the UI knowing how
 * the model is stored. Pure: no DOM, no IO.
 */

import { NEXUS_MEMORY_VIEWS, type NexusView } from './memoryViews';
import type { NexusModel, NexusEntity, NexusEntityKind } from './model';

/** memory-view id (plural) -> entity kind (singular). */
const VIEW_KIND: Record<string, NexusEntityKind> = {
  projects: 'project',
  ideas: 'idea',
  people: 'person',
  files: 'file',
  assets: 'asset',
  sessions: 'session',
  research: 'research',
  conversations: 'conversation',
};

export interface MemorySection {
  view: NexusView;
  kind: NexusEntityKind;
  count: number;
  /** Most-recent entities for the preview, newest first. */
  recent: NexusEntity[];
}

/** The entity kind backing a memory view, if it is a content view. */
export function kindForView(viewId: string): NexusEntityKind | undefined {
  return VIEW_KIND[viewId];
}

/**
 * Build the sidebar sections for the memory-first Nexus: one per primary memory
 * view, each with its live count and a capped recent-entity preview.
 */
export function buildMemorySections(model: NexusModel, previewLimit = 5): MemorySection[] {
  return NEXUS_MEMORY_VIEWS.map((view) => {
    const kind = VIEW_KIND[view.id];
    const all = kind ? model.byKind(kind) : [];
    return {
      view,
      kind: kind ?? 'project',
      count: all.length,
      recent: all.slice(0, Math.max(0, previewLimit)),
    };
  });
}

/** Total entities represented across all memory views. */
export function totalMemoryCount(model: NexusModel): number {
  return Object.values(VIEW_KIND).reduce((sum, kind) => sum + model.byKind(kind).length, 0);
}
