// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Dock 2.0 smart grouping (GOAL-6D). Classifies DEX apps into high-level
 * categories so the dock can group them automatically. Pure + testable; the dock
 * UI consumes `groupByCategory` to render grouped sections.
 */

export type AppCategory = 'creative' | 'development' | 'communication' | 'utility' | 'other';

const CATEGORY_MAP: Record<string, AppCategory> = {
  // Creative
  canvas: 'creative', prism: 'creative', flux: 'creative', forge: 'creative',
  imosion: 'creative', vinx: 'creative', pixelart: 'creative', presentation: 'creative',
  gallery: 'creative', whiteboard: 'creative', mindmap: 'creative', videoeditor: 'creative',
  // Development
  dexcode: 'development', code: 'development', terminal: 'development', axl: 'development',
  // Communication
  browser: 'communication', mail: 'communication', chat: 'communication', uki: 'communication',
  // Utility
  files: 'utility', settings: 'utility', calculator: 'utility', taskmanager: 'utility',
  rewind: 'utility', calendar: 'utility', notes: 'utility', reader: 'utility',
  pdfviewer: 'utility', clipboard: 'utility', power: 'utility',
};

export const CATEGORY_ORDER: AppCategory[] = [
  'creative', 'development', 'communication', 'utility', 'other',
];

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  creative: 'Creative',
  development: 'Development',
  communication: 'Communication',
  utility: 'Utility',
  other: 'Other',
};

/** The category for an app id (unknown ids → 'other'). */
export function appCategory(appId: string): AppCategory {
  return CATEGORY_MAP[appId.toLowerCase()] ?? 'other';
}

export interface CategoryGroup {
  category: AppCategory;
  label: string;
  apps: string[];
}

/**
 * Group app ids into categories, preserving input order within each group and
 * emitting groups in `CATEGORY_ORDER`. Empty categories are omitted.
 */
export function groupByCategory(appIds: readonly string[]): CategoryGroup[] {
  const buckets = new Map<AppCategory, string[]>();
  for (const id of appIds) {
    const cat = appCategory(id);
    const list = buckets.get(cat) ?? [];
    list.push(id);
    buckets.set(cat, list);
  }
  return CATEGORY_ORDER.filter((c) => buckets.has(c)).map((c) => ({
    category: c,
    label: CATEGORY_LABELS[c],
    apps: buckets.get(c)!,
  }));
}
