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
import { getThemePreference, resolveThemePreference } from '../utils/theme';
import {
  listArchives,
  getCompressionStats,
  type UkiArchiveRecord,
} from './compressedMemory';
import { DEX_APP_CATALOG, DEX_GLOBAL_SHORTCUTS, DEX_WORKFLOWS, DEX_TROUBLESHOOTING, DEX_ARCHITECTURE } from './knowledge';

const ARCHIVE_KEY = 'uki:mem:archive';
const FEED_STATE_KEY = 'uki:feed:state';
const FEED_BUDGET_KEY = 'uki:feed:budget';
const INSTALLED_APPS_KEY = 'uki:feed:installed-apps';

export const DEFAULT_BUDGET_BYTES = 100 * 1024 * 1024; // 100 MB
const MIN_FEED_INTERVAL_MS = 5 * 60 * 1000;            // 5 minutes between runs

interface FeedState {
  lastRunTs: number;
  totalIngested: number;
  sources: Record<string, { lastTs: number; count: number }>;
}

interface InstalledAppRecord {
  packageId: string;
  version?: string;
  installedAt: number;
}

async function readFeedState(): Promise<FeedState> {
  const v = await cache.getAsync<FeedState>(FEED_STATE_KEY);
  return v ?? { lastRunTs: 0, totalIngested: 0, sources: {} };
}

async function writeFeedState(s: FeedState): Promise<void> {
  await cache.setAsync(FEED_STATE_KEY, s, { encrypted: false, ttl: 0 });
}

/** Configurable byte budget. Defaults to 100 MB. */
export async function getBudgetBytes(): Promise<number> {
  const v = await cache.getAsync<number>(FEED_BUDGET_KEY);
  return typeof v === 'number' && v > 0 ? v : DEFAULT_BUDGET_BYTES;
}

export async function setBudgetBytes(bytes: number): Promise<void> {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  await cache.setAsync(FEED_BUDGET_KEY, bytes, { encrypted: false, ttl: 0 });
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

function safeParseArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v as T[] : [];
  } catch { return []; }
}

function collectBookmarks(): SourceFact[] {
  type BM = { id?: string; title?: string; url?: string; folderId?: string; addedAt?: number };
  const list = safeParseArray<BM>('dex-browser-bookmarks');
  return list.slice(-MAX_FACTS_PER_SOURCE).map(b => ({
    source: 'bookmarks',
    user: `What is the bookmark "${b.title ?? b.url ?? ''}"?`,
    response: clip(`Bookmark "${b.title ?? ''}" -> ${b.url ?? ''} (folder ${b.folderId ?? 'root'})`),
    ts: b.addedAt ?? Date.now(),
    appId: 'browser',
  }));
}

function collectBrowserHistory(): SourceFact[] {
  type H = { url?: string; title?: string; visitedAt?: number };
  const list = safeParseArray<H>('dex-browser-history');
  return list.slice(-MAX_FACTS_PER_SOURCE).map(h => ({
    source: 'browser-history',
    user: `Has the user visited ${h.url ?? h.title ?? 'this page'}?`,
    response: clip(`Visited ${h.title ?? ''} (${h.url ?? ''}) at ${new Date(h.visitedAt ?? 0).toISOString()}.`),
    ts: h.visitedAt ?? Date.now(),
    appId: 'browser',
  }));
}

function collectFileTags(): SourceFact[] {
  try {
    const raw = localStorage.getItem('dex-file-tags');
    if (!raw) return [];
    const obj = JSON.parse(raw) as Record<string, string[]>;
    return Object.entries(obj).slice(0, MAX_FACTS_PER_SOURCE).map(([path, tags]) => ({
      source: 'file-tags',
      user: `Which tags did the user assign to ${path}?`,
      response: clip(`File ${path} is tagged: ${(tags ?? []).join(', ') || 'none'}.`),
      ts: Date.now(),
      appId: 'files',
    }));
  } catch { return []; }
}

function collectSmartFolders(): SourceFact[] {
  type SF = { id?: string; name?: string; query?: string; rules?: unknown };
  const list = safeParseArray<SF>('dex-smart-folders');
  return list.slice(0, MAX_FACTS_PER_SOURCE).map(f => ({
    source: 'smart-folders',
    user: `What is the smart folder "${f.name ?? ''}"?`,
    response: clip(`Smart folder "${f.name ?? ''}" matches: ${f.query ?? JSON.stringify(f.rules ?? {})}.`),
    ts: Date.now(),
    appId: 'files',
  }));
}

function collectGalleryFavorites(): SourceFact[] {
  try {
    const raw = localStorage.getItem('dex-gallery-favorites');
    if (!raw) return [];
    const list = JSON.parse(raw) as string[];
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_FACTS_PER_SOURCE).map(path => ({
      source: 'gallery-favorites',
      user: `Is ${path} a favorite image?`,
      response: clip(`Image ${path} is starred in Gallery.`),
      ts: Date.now(),
      appId: 'gallery',
    }));
  } catch { return []; }
}

function collectAudioPlaylists(): SourceFact[] {
  type P = { id?: string; name?: string; tracks?: Array<{ path?: string; title?: string }> };
  const list = safeParseArray<P>('dex-audio-playlists');
  return list.slice(0, MAX_FACTS_PER_SOURCE).map(p => ({
    source: 'audio-playlists',
    user: `What is in the playlist "${p.name ?? ''}"?`,
    response: clip(`Playlist "${p.name ?? ''}" has ${p.tracks?.length ?? 0} tracks: ${(p.tracks ?? []).slice(0, 8).map(t => t.title ?? t.path).join(', ')}`),
    ts: Date.now(),
    appId: 'audio',
  }));
}

function collectRecentSearches(): SourceFact[] {
  type S = { query?: string; ts?: number; resultCount?: number };
  const list = safeParseArray<S>('dex-recent-searches');
  return list.slice(-MAX_FACTS_PER_SOURCE).map(s => ({
    source: 'recent-searches',
    user: `What did the user search for recently?`,
    response: clip(`Search "${s.query ?? ''}" at ${new Date(s.ts ?? 0).toISOString()} returned ${s.resultCount ?? 0} results.`),
    ts: s.ts ?? Date.now(),
  }));
}

function collectClipboardPinned(): SourceFact[] {
  try {
    const raw = localStorage.getItem('dex-clipboard-pinned');
    if (!raw) return [];
    const list = JSON.parse(raw) as string[];
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_FACTS_PER_SOURCE).map(text => ({
      source: 'clipboard-pinned',
      user: `What is pinned on the clipboard?`,
      response: clip(`Pinned clipboard entry: ${text}`),
      ts: Date.now(),
    }));
  } catch { return []; }
}

function collectThemePrefs(): SourceFact[] {
  try {
    const pref = getThemePreference();
    const accent = localStorage.getItem('dex-accent-color');
    return [{
      source: 'theme-prefs',
      user: 'What theme does the user prefer?',
      response: clip(`Appearance: ${pref === 'system' ? `follows the system (now ${resolveThemePreference(pref)})` : pref}; accent: ${accent ?? 'system blue'}.`),
      ts: Date.now(),
      appId: 'settings',
    }];
  } catch { return []; }
}

function collectKnowledgeReference(): SourceFact[] {
  // Bake the curated DEX_GLOBAL_SHORTCUTS and DEX_WORKFLOWS reference data
  // into UKI's archive so she can answer "how do I X" offline.
  const out: SourceFact[] = [];
  try {
    const shortcuts = Object.entries(DEX_GLOBAL_SHORTCUTS).slice(0, MAX_FACTS_PER_SOURCE / 2);
    for (const [keys, action] of shortcuts) {
      out.push({
        source: 'knowledge-reference',
        user: `What does the keyboard shortcut ${keys} do?`,
        response: clip(`${keys}: ${action}`),
        ts: Date.now(),
      });
    }
    for (const wf of DEX_WORKFLOWS.slice(0, MAX_FACTS_PER_SOURCE / 2)) {
      out.push({
        source: 'knowledge-reference',
        user: `How do I ${wf.title}?`,
        response: clip(`${wf.title}: ${wf.steps.join(' -> ')}`),
        ts: Date.now(),
      });
    }
    // Troubleshooting (symptom -> cause -> fix) so UKI can diagnose offline.
    for (const t of DEX_TROUBLESHOOTING) {
      out.push({
        source: 'knowledge-reference',
        user: t.symptom,
        response: clip(`${t.symptom} Likely cause: ${t.cause}. Fix: ${t.fix.join(' -> ')}`),
        ts: Date.now(),
      });
    }
    // System-architecture facts so UKI can explain how DEX itself works.
    for (const a of DEX_ARCHITECTURE) {
      out.push({
        source: 'knowledge-reference',
        user: `How does DEX handle ${a.topic}?`,
        response: clip(a.fact),
        ts: Date.now(),
      });
    }
  } catch { /* knowledge module missing */ }
  return out;
}

const COLLECTORS: Array<{ name: string; collect: () => SourceFact[] | Promise<SourceFact[]> }> = [
  { name: 'app-catalog', collect: collectAppCatalog },
  { name: 'knowledge-reference', collect: collectKnowledgeReference },
  { name: 'recent-files', collect: collectRecentFiles },
  { name: 'notes', collect: collectNotes },
  { name: 'running-apps', collect: collectRunningApps },
  { name: 'cached-facts', collect: collectCachedFacts },
  { name: 'installed-apps', collect: collectInstalledApps },
  { name: 'bookmarks', collect: collectBookmarks },
  { name: 'browser-history', collect: collectBrowserHistory },
  { name: 'file-tags', collect: collectFileTags },
  { name: 'smart-folders', collect: collectSmartFolders },
  { name: 'gallery-favorites', collect: collectGalleryFavorites },
  { name: 'audio-playlists', collect: collectAudioPlaylists },
  { name: 'recent-searches', collect: collectRecentSearches },
  { name: 'clipboard-pinned', collect: collectClipboardPinned },
  { name: 'theme-prefs', collect: collectThemePrefs },
];

// ---------------------------------------------------------------------------
// Installed-apps registry -- third-party / store apps the user added after
// initial install. Updated by `notifyAppInstalled` / `notifyAppUninstalled`
// from the Store page so UKI immediately knows new apps exist.
// ---------------------------------------------------------------------------

async function readInstalledApps(): Promise<InstalledAppRecord[]> {
  return (await cache.getAsync<InstalledAppRecord[]>(INSTALLED_APPS_KEY)) ?? [];
}

async function writeInstalledApps(list: InstalledAppRecord[]): Promise<void> {
  await cache.setAsync(INSTALLED_APPS_KEY, list, { encrypted: false, ttl: 0 });
}

function collectInstalledApps(): SourceFact[] | Promise<SourceFact[]> {
  return readInstalledApps().then(list =>
    list.slice(-MAX_FACTS_PER_SOURCE).map(a => ({
      source: 'installed-apps',
      user: `What is the ${a.packageId} app?`,
      response: clip(`The user installed ${a.packageId}${a.version ? ` v${a.version}` : ''} on ${new Date(a.installedAt).toISOString()}. It is now available from the dock and Launchpad.`),
      ts: a.installedAt,
      appId: a.packageId,
    }))
  );
}

/**
 * Called by the Store after a successful install. Records the fact, kicks an
 * immediate (forced) feed pass so UKI knows about the new app right now.
 */
export async function notifyAppInstalled(info: { packageId: string; version?: string }): Promise<void> {
  const list = await readInstalledApps();
  const filtered = list.filter(a => a.packageId !== info.packageId);
  filtered.push({ packageId: info.packageId, version: info.version, installedAt: Date.now() });
  await writeInstalledApps(filtered.slice(-200));
  // Fire a forced feed so the new app fact lands in compressed memory now.
  try { await runKnowledgeFeed({ force: true }); } catch { /* non-critical */ }
}

/** Called by the Store after a successful uninstall. */
export async function notifyAppUninstalled(packageId: string): Promise<void> {
  const list = await readInstalledApps();
  const filtered = list.filter(a => a.packageId !== packageId);
  await writeInstalledApps(filtered);
}

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
  const budgetBytes = opts.budgetBytes ?? (await getBudgetBytes());
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

export async function getFeedStatus(budgetBytes?: number): Promise<{
  lastRunTs: number;
  totalIngested: number;
  archives: UkiArchiveRecord[];
  bytesUsed: number;
  budgetBytes: number;
  utilization: number;
}> {
  const budget = budgetBytes ?? (await getBudgetBytes());
  const state = await readFeedState();
  const archives = await listArchives();
  const bytesUsed = archives.reduce((s, a) => s + a.compressedBytes, 0);
  return {
    lastRunTs: state.lastRunTs,
    totalIngested: state.totalIngested,
    archives,
    bytesUsed,
    budgetBytes: budget,
    utilization: budget > 0 ? bytesUsed / budget : 0,
  };
}
