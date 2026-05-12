// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Knowledge Feeder
 *
 * Pulls real local user data (recent files, notes, app catalog, running apps,
 * cached free-API facts, conversation history) into UKI's compressed archive
 * so she has substantive context to answer from. Local-first; nothing leaves
 * the device. A configurable byte budget (default 100 MB) caps total archive
 * size by pruning the oldest archives when the budget is exceeded.
 *
 * Trigger model: lazy. Callers invoke `runKnowledgeFeed()` from app idle
 * paths (e.g. when UKI overlay opens, or every N minutes from a renderer
 * heartbeat). No background polling.
 */

import * as cache from './cache';
import { recordTurn } from './memory';
import {
  listArchives,
  getCompressionStats,
  type UkiArchiveRecord,
} from './compressedMemory';
import { DEX_APP_CATALOG } from './knowledge';

const ARCHIVE_KEY = 'uki:mem:archive';
const FEED_STATE_KEY = 'uki:feed:state';

export const DEFAULT_BUDGET_BYTES = 100 * 1024 * 1024; // 100 MB
const MIN_FEED_INTERVAL_MS = 5 * 60 * 1000;            // 5 minutes between runs

interface FeedState {
  lastRunTs: number;
  totalIngested: number;
  sources: Record<string, { lastTs: number; count: number }>;
}

async function readFeedState(): Promise<FeedState> {
  const v = await cache.getAsync<FeedState>(FEED_STATE_KEY);
  return v ?? { lastRunTs: 0, totalIngested: 0, sources: {} };
}

async function writeFeedState(s: FeedState): Promise<void> {
  await cache.setAsync(FEED_STATE_KEY, s, { encrypted: false, ttl: 0 });
}

// ---------------------------------------------------------------------------
// Source collectors -- each returns short fact strings suitable for ingestion
// as synthetic UKI turns. Keep payloads bounded to protect memory.
// ---------------------------------------------------------------------------

const MAX_FACTS_PER_SOURCE = 80;
const MAX_FACT_LENGTH = 800;

function clip(s: string): string {
  return s.length > MAX_FACT_LENGTH ? s.slice(0, MAX_FACT_LENGTH) + '...' : s;
}

interface SourceFact {
  source: string;
  user: string;          // synthetic prompt describing the data
  response: string;      // the data itself, summarised
  ts: number;
  appId?: string;
}

function collectAppCatalog(): SourceFact[] {
  return DEX_APP_CATALOG.slice(0, MAX_FACTS_PER_SOURCE).map(app => ({
    source: 'app-catalog',
    user: `What does the ${app.name} app do?`,
    response: clip(`${app.name} -- ${app.oneLine}. Capabilities: ${app.capabilities.join(', ')}. Category: ${app.category}.`),
    ts: Date.now(),
    appId: app.id,
  }));
}

function collectRecentFiles(): SourceFact[] {
  try {
    const raw = localStorage.getItem('dex-recent-files');
    if (!raw) return [];
    const arr = JSON.parse(raw) as Array<{ path: string; name: string; appId: string; openedAt: number }>;
    return arr.slice(0, MAX_FACTS_PER_SOURCE).map(f => ({
      source: 'recent-files',
      user: `When did the user last open ${f.name}?`,
      response: clip(`The user opened ${f.name} (${f.path}) in ${f.appId} on ${new Date(f.openedAt).toISOString()}.`),
      ts: f.openedAt || Date.now(),
      appId: f.appId,
    }));
  } catch {
    return [];
  }
}

function collectNotes(): SourceFact[] {
  try {
    // notesStore persists via IPC but a small mirror lives in localStorage when
    // the renderer falls back to the in-memory pool.
    const raw = localStorage.getItem('dex-notes-mirror');
    if (!raw) return [];
    const arr = JSON.parse(raw) as Array<{ id: string; title: string; plain_text?: string; updated_at?: number; tags?: string[] }>;
    return arr.slice(0, MAX_FACTS_PER_SOURCE).map(n => ({
      source: 'notes',
      user: `What is in the note titled "${n.title}"?`,
      response: clip(`Note "${n.title}" (tags: ${(n.tags ?? []).join(', ') || 'none'}): ${n.plain_text ?? ''}`),
      ts: n.updated_at || Date.now(),
      appId: 'notes',
    }));
  } catch {
    return [];
  }
}

function collectRunningApps(): SourceFact[] {
  try {
    const raw = localStorage.getItem('dex-running-apps');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { runningApps?: Array<{ id: string; name: string; lastActiveAt: number }> } };
    const list = parsed?.state?.runningApps ?? [];
    return list.slice(0, MAX_FACTS_PER_SOURCE).map(a => ({
      source: 'running-apps',
      user: `Which apps did the user have open?`,
      response: clip(`${a.name} (${a.id}) was active at ${new Date(a.lastActiveAt).toISOString()}.`),
      ts: a.lastActiveAt || Date.now(),
      appId: a.id,
    }));
  } catch {
    return [];
  }
}

function collectCachedFacts(): SourceFact[] {
  // The UKI cache layer prefixes keys with `uki:cache:`. Surface anything that
  // looks like a free-API fact record so retrieval can use it offline.
  const out: SourceFact[] = [];
  try {
    for (let i = 0; i < localStorage.length && out.length < MAX_FACTS_PER_SOURCE; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('uki:cache:fact:')) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { data?: { source?: string; key?: string; payload?: unknown }; ts?: number };
        const d = parsed?.data;
        if (!d) continue;
        out.push({
          source: 'cached-facts',
          user: `What does ${d.source ?? 'the local cache'} say about ${d.key ?? 'this topic'}?`,
          response: clip(`${d.source ?? 'cache'} :: ${d.key ?? ''} :: ${typeof d.payload === 'string' ? d.payload : JSON.stringify(d.payload).slice(0, 400)}`),
          ts: parsed.ts ?? Date.now(),
        });
      } catch { /* skip malformed */ }
    }
  } catch { /* ignore */ }
  return out;
}

const COLLECTORS: Array<{ name: string; collect: () => SourceFact[] | Promise<SourceFact[]> }> = [
  { name: 'app-catalog', collect: collectAppCatalog },
  { name: 'recent-files', collect: collectRecentFiles },
  { name: 'notes', collect: collectNotes },
  { name: 'running-apps', collect: collectRunningApps },
  { name: 'cached-facts', collect: collectCachedFacts },
];

// ---------------------------------------------------------------------------
// Budget enforcement -- prune oldest archives until total compressed bytes
// fit within the configured budget.
// ---------------------------------------------------------------------------

export async function enforceBudget(budgetBytes: number = DEFAULT_BUDGET_BYTES): Promise<{ removed: number; bytesAfter: number }> {
  const archives = await listArchives();
  // Oldest-first so we drop history before recent context.
  const sorted = [...archives].sort((a, b) => a.createdTs - b.createdTs);
  let total = sorted.reduce((s, a) => s + a.compressedBytes, 0);
  let removed = 0;
  while (total > budgetBytes && sorted.length > 1) {
    const dropped = sorted.shift();
    if (!dropped) break;
    total -= dropped.compressedBytes;
    removed++;
  }
  if (removed > 0) {
    await cache.setAsync(ARCHIVE_KEY, sorted, { encrypted: true });
  }
  return { removed, bytesAfter: total };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FeedResult {
  ranAt: number;
  ingestedTurns: number;
  sources: Record<string, number>;
  archivesAfter: number;
  bytesAfter: number;
  pruned: number;
  budgetBytes: number;
}

export interface FeedOptions {
  budgetBytes?: number;
  /** Force a run even if the cooldown is active. */
  force?: boolean;
}

/**
 * Run a single knowledge-feed pass. Collects facts from local sources,
 * appends them as synthetic turns (so the existing compression pipeline
 * archives them), then enforces the byte budget.
 */
export async function runKnowledgeFeed(opts: FeedOptions = {}): Promise<FeedResult | null> {
  const budgetBytes = opts.budgetBytes ?? DEFAULT_BUDGET_BYTES;
  const state = await readFeedState();
  const now = Date.now();
  if (!opts.force && now - state.lastRunTs < MIN_FEED_INTERVAL_MS) return null;

  const ingestedBySource: Record<string, number> = {};
  let ingestedTotal = 0;
  for (const c of COLLECTORS) {
    let facts: SourceFact[];
    try { facts = await c.collect(); } catch { facts = []; }
    if (!facts.length) continue;
    const previousTs = state.sources[c.name]?.lastTs ?? 0;
    const fresh = facts.filter(f => f.ts > previousTs);
    if (!fresh.length) continue;
    for (const f of fresh) {
      try {
        await recordTurn(f.user, f.response, {
          appContext: f.appId ? { foregroundAppId: f.appId } : undefined,
        });
        ingestedTotal++;
      } catch { /* ignore per-fact failures */ }
    }
    ingestedBySource[c.name] = fresh.length;
    state.sources[c.name] = { lastTs: Math.max(...fresh.map(f => f.ts)), count: (state.sources[c.name]?.count ?? 0) + fresh.length };
  }

  state.lastRunTs = now;
  state.totalIngested += ingestedTotal;
  await writeFeedState(state);

  const { removed, bytesAfter } = await enforceBudget(budgetBytes);
  const stats = await getCompressionStats();
  return {
    ranAt: now,
    ingestedTurns: ingestedTotal,
    sources: ingestedBySource,
    archivesAfter: stats.archiveCount,
    bytesAfter,
    pruned: removed,
    budgetBytes,
  };
}

export async function getFeedStatus(budgetBytes: number = DEFAULT_BUDGET_BYTES): Promise<{
  lastRunTs: number;
  totalIngested: number;
  archives: UkiArchiveRecord[];
  bytesUsed: number;
  budgetBytes: number;
  utilization: number;
}> {
  const state = await readFeedState();
  const archives = await listArchives();
  const bytesUsed = archives.reduce((s, a) => s + a.compressedBytes, 0);
  return {
    lastRunTs: state.lastRunTs,
    totalIngested: state.totalIngested,
    archives,
    bytesUsed,
    budgetBytes,
    utilization: budgetBytes > 0 ? bytesUsed / budgetBytes : 0,
  };
}
