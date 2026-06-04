// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Search-result grouping (Spotlight / command-palette sections). Buckets a
 * blended result list into ordered, labelled sections by kind, preserving each
 * section's internal ranking. Pure: no DOM, no IO.
 */

import type { SearchResult, SearchKind } from '../search/SearchOrchestrator';

// Display order + labels for result sections.
const KIND_ORDER: SearchKind[] = [
  'calculator', 'unit', 'app', 'command', 'action',
  'file', 'folder', 'note', 'task', 'asset', 'setting', 'memory', 'web',
];

const KIND_LABELS: Partial<Record<SearchKind, string>> = {
  app: 'Apps', command: 'Commands', action: 'Actions', file: 'Files', folder: 'Folders',
  note: 'Notes', task: 'Tasks', asset: 'Assets', setting: 'Settings', memory: 'Memory',
  web: 'Web', calculator: 'Calculator', unit: 'Conversion',
};

export interface ResultGroup {
  kind: SearchKind;
  label: string;
  results: SearchResult[];
}

/** Group results into ordered, labelled sections (highest-score sections first). */
export function groupByKind(results: readonly SearchResult[]): ResultGroup[] {
  const byKind = new Map<SearchKind, SearchResult[]>();
  for (const r of results) {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }

  const groups: ResultGroup[] = [];
  // Known kinds first, in canonical order.
  for (const kind of KIND_ORDER) {
    const list = byKind.get(kind);
    if (list && list.length > 0) {
      groups.push({ kind, label: KIND_LABELS[kind] ?? kind, results: list });
      byKind.delete(kind);
    }
  }
  // Any remaining kinds, alphabetically.
  for (const kind of Array.from(byKind.keys()).sort()) {
    groups.push({ kind, label: KIND_LABELS[kind] ?? kind, results: byKind.get(kind)! });
  }
  return groups;
}

/** The single best result across all groups (top of the blended list), or null. */
export function topResult(results: readonly SearchResult[]): SearchResult | null {
  return results.length ? results.reduce((a, b) => (b.score > a.score ? b : a)) : null;
}
