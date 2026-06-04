// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus 2.0 — memory-first view model.
 * -----------------------------------------------------------------------------
 * Nexus is being reframed from graph-first to memory-first: users remember
 * *work* (projects, ideas, people, files…), not nodes. This pure module defines
 * the canonical primary (memory) views and the secondary (graph/structural)
 * views, plus ordering/lookup helpers the Nexus UI consumes to lay out its
 * sidebar. No DOM, no state — just the model.
 */

export type NexusViewTier = 'memory' | 'structure';

export interface NexusView {
  id: string;
  label: string;
  /** Memory views are primary; structure views (graph) are secondary. */
  tier: NexusViewTier;
  /** Lower sorts first within a tier. */
  order: number;
  /** Icon hint for the UI (maps to DexIcon names). */
  icon: string;
  /** One-line description for tooltips / empty states. */
  description: string;
}

/** Primary memory views — what users actually recall. */
export const NEXUS_MEMORY_VIEWS: readonly NexusView[] = [
  { id: 'projects',      label: 'Projects',      tier: 'memory', order: 1, icon: 'workflows', description: 'Active and recent projects with their context.' },
  { id: 'ideas',         label: 'Ideas',         tier: 'memory', order: 2, icon: 'notes',     description: 'Captured thoughts, drafts, and sparks.' },
  { id: 'people',        label: 'People',        tier: 'memory', order: 3, icon: 'collabhub', description: 'Collaborators and contacts linked to your work.' },
  { id: 'files',         label: 'Files',         tier: 'memory', order: 4, icon: 'files',     description: 'Documents and media you have touched.' },
  { id: 'assets',        label: 'Assets',        tier: 'memory', order: 5, icon: 'colorpicker', description: 'Reusable brushes, palettes, samples, and presets.' },
  { id: 'sessions',      label: 'Sessions',      tier: 'memory', order: 6, icon: 'rewind',    description: 'Past work sessions you can reconstruct.' },
  { id: 'research',      label: 'Research',      tier: 'memory', order: 7, icon: 'browser',   description: 'Saved research, pages, and references.' },
  { id: 'conversations', label: 'Conversations', tier: 'memory', order: 8, icon: 'nexus',     description: 'Threads and exchanges with UKI and collaborators.' },
];

/** Secondary structural views — the graph is now one tool among many. */
export const NEXUS_STRUCTURE_VIEWS: readonly NexusView[] = [
  { id: 'graph',     label: 'Graph',     tier: 'structure', order: 1, icon: 'nexus', description: 'Node-link view of how everything connects.' },
  { id: 'timeline',  label: 'Timeline',  tier: 'structure', order: 2, icon: 'rewind', description: 'Chronological view across all memory.' },
];

export const NEXUS_VIEWS: readonly NexusView[] = [...NEXUS_MEMORY_VIEWS, ...NEXUS_STRUCTURE_VIEWS];

/** The default view Nexus opens on (memory-first, not the graph). */
export const NEXUS_DEFAULT_VIEW_ID = 'projects';

/** All views ordered for the sidebar: memory tier first, then structure. */
export function orderedNexusViews(): NexusView[] {
  const byTier = (tier: NexusViewTier) =>
    NEXUS_VIEWS.filter((v) => v.tier === tier).sort((a, b) => a.order - b.order);
  return [...byTier('memory'), ...byTier('structure')];
}

/** Look up a view by id. */
export function getNexusView(id: string): NexusView | undefined {
  const k = id.toLowerCase();
  return NEXUS_VIEWS.find((v) => v.id === k);
}

/** True when a view is a primary (memory) view. */
export function isMemoryView(id: string): boolean {
  return getNexusView(id)?.tier === 'memory';
}
