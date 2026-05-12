// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI smart-collection rules + duplicate detection (T5-047, T5-048).
 *
 * Pure data utilities — no UKI store import to keep them testable in
 * isolation. The UKI knowledge feeder calls these on each ingest.
 */

export interface KnowledgeItem {
  id: string;
  source: string;       // e.g. 'app-catalog', 'recent-files'
  title: string;
  body: string;
  tags?: readonly string[];
  ts: number;
}

export type SmartRuleOp = 'eq' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt';

export interface SmartRule {
  field: 'source' | 'title' | 'body' | 'tag' | 'ts';
  op: SmartRuleOp;
  value: string | number;
}

export interface SmartCollection {
  id: string;
  name: string;
  /** AND across rules. Use multiple collections for OR semantics. */
  rules: readonly SmartRule[];
}

function fieldValue(item: KnowledgeItem, field: SmartRule['field']): string | number | undefined {
  switch (field) {
    case 'source': return item.source;
    case 'title': return item.title;
    case 'body': return item.body;
    case 'ts': return item.ts;
    case 'tag': return (item.tags ?? []).join(' ');
  }
}

function matchRule(item: KnowledgeItem, rule: SmartRule): boolean {
  const v = fieldValue(item, rule.field);
  if (v === undefined) return false;
  switch (rule.op) {
    case 'eq':         return String(v).toLowerCase() === String(rule.value).toLowerCase();
    case 'contains':   return String(v).toLowerCase().includes(String(rule.value).toLowerCase());
    case 'startsWith': return String(v).toLowerCase().startsWith(String(rule.value).toLowerCase());
    case 'endsWith':   return String(v).toLowerCase().endsWith(String(rule.value).toLowerCase());
    case 'gt':         return Number(v) > Number(rule.value);
    case 'lt':         return Number(v) < Number(rule.value);
  }
}

export function applyCollection(items: readonly KnowledgeItem[], col: SmartCollection): KnowledgeItem[] {
  return items.filter((it) => col.rules.every((r) => matchRule(it, r)));
}

/* ---- duplicate detection (T5-048) ----
 * Uses a cheap shingled fingerprint: lowercased body split into 3-grams.
 * Two items are duplicates when |intersection|/|union| (Jaccard) >= threshold.
 */

export function shingles(text: string, k = 3): Set<string> {
  const cleaned = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ');
  const out = new Set<string>();
  if (words.length < k) {
    if (words.length > 0) out.add(words.join(' '));
    return out;
  }
  for (let i = 0; i + k <= words.length; i++) {
    out.add(words.slice(i, i + k).join(' '));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface DuplicateGroup {
  representative: KnowledgeItem;
  duplicates: KnowledgeItem[];
}

export function findDuplicates(
  items: readonly KnowledgeItem[],
  threshold = 0.85,
): DuplicateGroup[] {
  const fingerprints = items.map((it) => shingles(it.body));
  const visited = new Set<number>();
  const out: DuplicateGroup[] = [];
  for (let i = 0; i < items.length; i++) {
    if (visited.has(i)) continue;
    const group: KnowledgeItem[] = [];
    for (let j = i + 1; j < items.length; j++) {
      if (visited.has(j)) continue;
      const sim = jaccard(fingerprints[i], fingerprints[j]);
      if (sim >= threshold) {
        group.push(items[j]);
        visited.add(j);
      }
    }
    if (group.length > 0) {
      visited.add(i);
      out.push({ representative: items[i], duplicates: group });
    }
  }
  return out;
}
