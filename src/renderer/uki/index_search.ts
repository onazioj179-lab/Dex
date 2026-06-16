// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Local Index — tiny, dependency-free lexical search over the knowledge
 * base + saved workflows + recent turns. Not a vector store; a fast inverted
 * index built lazily on first query and refreshed when the underlying memory
 * changes (caller-driven via `invalidate()`).
 *
 * Role (audit FINDING 9): this is the LEXICAL BACKEND of the single search
 * facade `./semanticSearch.ts`, not a parallel "find" surface. UI should call
 * `semanticSearch()`, which delegates to `query()` here for the lexical half of
 * the hybrid retriever and (once enabled) merges the semantic half from
 * shared/uki/embeddings + the main-process EmbeddingService. The two indexes
 * are one hybrid system; see semanticSearch.ts for the contract.
 *
 * Designed for sub-10ms lookups on a few hundred docs. Larger corpora should
 * move to a proper FTS index (planned: SQLite FTS5 in main).
 */

import { DEX_APP_CATALOG, DEX_GLOBAL_SHORTCUTS, DEX_WORKFLOWS } from './knowledge';
import { listWorkflows, recentTurns } from './memory';

export type UkiDocKind = 'app' | 'shortcut' | 'workflow' | 'turn';

export interface UkiDoc {
  id: string;
  kind: UkiDocKind;
  title: string;
  body: string;
  tags?: readonly string[];
}

export interface UkiHit {
  doc: UkiDoc;
  score: number;
}

let _docs: UkiDoc[] | null = null;
let _index: Map<string, Set<string>> | null = null; // term -> doc ids

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'with', 'for', 'is', 'it']);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

async function buildCorpus(): Promise<UkiDoc[]> {
  const docs: UkiDoc[] = [];
  for (const app of DEX_APP_CATALOG) {
    docs.push({
      id: `app:${app.id}`,
      kind: 'app',
      title: app.name,
      body: `${app.oneLine} ${app.capabilities.join(' ')}`,
      tags: [app.category],
    });
  }
  for (const [keys, label] of Object.entries(DEX_GLOBAL_SHORTCUTS)) {
    docs.push({
      id: `sc:${keys}`,
      kind: 'shortcut',
      title: keys,
      body: `${label} shortcut hotkey`,
    });
  }
  for (const wf of DEX_WORKFLOWS) {
    docs.push({
      id: `wf:${wf.id}`,
      kind: 'workflow',
      title: wf.title,
      body: wf.steps.join(' '),
    });
  }
  try {
    const userWfs = await listWorkflows();
    for (const wf of userWfs) {
      docs.push({
        id: `uwf:${wf.id}`,
        kind: 'workflow',
        title: wf.title,
        body: wf.steps.join(' '),
      });
    }
  } catch { /* memory not ready */ }
  try {
    const turns = await recentTurns(40);
    for (const t of turns) {
      docs.push({
        id: `t:${t.id}`,
        kind: 'turn',
        title: t.user.slice(0, 80),
        body: `${t.user} ${t.ukiResponse}`.slice(0, 600),
      });
    }
  } catch { /* memory not ready */ }
  try {
    // Surface compressed long-term archives as searchable summaries so older
    // context is reachable without expanding the gzip payload.
    const mod = await import('./compressedMemory');
    const archives = await mod.listArchives();
    for (const a of archives) {
      docs.push({
        id: `arc:${a.id}`,
        kind: 'turn',
        title: a.summary.slice(0, 80),
        body: `${a.summary} ${a.topics.join(' ')} ${a.apps.join(' ')}`.slice(0, 600),
        tags: ['archive'],
      });
    }
  } catch { /* compressed memory not available */ }
  return docs;
}

function buildIndex(docs: UkiDoc[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const doc of docs) {
    const terms = new Set<string>([
      ...tokenize(doc.title),
      ...tokenize(doc.body),
    ]);
    for (const term of terms) {
      let set = idx.get(term);
      if (!set) { set = new Set(); idx.set(term, set); }
      set.add(doc.id);
    }
  }
  return idx;
}

async function ensureIndex(): Promise<void> {
  if (_docs && _index) return;
  _docs = await buildCorpus();
  _index = buildIndex(_docs);
}

/** Drop the in-memory index so the next query rebuilds. */
export function invalidate(): void {
  _docs = null;
  _index = null;
}

export async function query(q: string, limit = 8): Promise<UkiHit[]> {
  if (!q || q.trim().length === 0) return [];
  await ensureIndex();
  if (!_docs || !_index) return [];
  const terms = tokenize(q);
  if (terms.length === 0) return [];
  const scores = new Map<string, number>();
  for (const t of terms) {
    // Prefix expansion: any indexed term starting with this token also matches.
    for (const [indexed, ids] of _index) {
      if (indexed === t || indexed.startsWith(t)) {
        const w = indexed === t ? 1.0 : 0.6;
        for (const id of ids) scores.set(id, (scores.get(id) ?? 0) + w);
      }
    }
  }
  const byId = new Map(_docs.map((d) => [d.id, d] as const));
  const hits: UkiHit[] = [];
  for (const [id, score] of scores) {
    const doc = byId.get(id);
    if (doc) hits.push({ doc, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
