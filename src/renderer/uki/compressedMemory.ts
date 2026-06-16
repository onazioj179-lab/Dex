// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Compressed Memory -- the COLD tier of `./memory` (renderer persistence
 * adapter). This is NOT a parallel store: it owns no turns of its own. It
 * reads the hot rolling window from `./memory` (via `readTurns`), consolidates
 * the oldest turns into a compact, optionally-encrypted archive, and writes the
 * trimmed window back through the same `uki:mem:turns` key. The archive lives
 * under `uki:mem:archive` alongside that hot key in the shared UKI cache layer.
 *
 * Tier contract (single store, two physical keys):
 *   - hot  (`uki:mem:turns`):   owned by `./memory`, last MAX_TURNS exchanges.
 *   - cold (`uki:mem:archive`): owned here, gzip summaries of evicted turns.
 * Eviction is one-directional hot -> cold; cold is reachable for read-only
 * retrieval via `searchArchives` / `expandArchive` and is surfaced into the
 * lexical index by `./index_search` (which imports `listArchives` from here).
 *
 * Strategy:
 *   1. When raw turns exceed COMPRESS_THRESHOLD, take the oldest
 *      OLDER_BATCH and produce a short text summary (intent, recurring
 *      topics, app context) + a gzip-compressed JSON payload of the raw
 *      turns for cold lookup.
 *   2. Trim the consolidated turns from the hot rolling window.
 *   3. Archive entries are appended to ARCHIVE_KEY and written through
 *      the existing UKI cache layer with encryption enabled.
 *
 * Local-first: archives never leave the device unless the user explicitly
 * exports them via Settings. No background timers; consolidation runs
 * lazily when callers invoke maybeConsolidate() (driven by `./memory`'s
 * `recordTurn`).
 */

import * as cache from './cache';
import { readTurns } from './memory';
import { migrate, SCHEMA_VERSION, type UkiTurnRecord, type UkiVersioned } from './schemas';

const TURNS_KEY = 'uki:mem:turns';
const ARCHIVE_KEY = 'uki:mem:archive';

export const COMPRESS_THRESHOLD = 150; // start consolidating once turns exceed this
export const OLDER_BATCH = 50;         // consolidate this many oldest turns at a time
export const MAX_ARCHIVES = 40;        // hard cap on archive count

export interface UkiArchiveRecord extends UkiVersioned {
  id: string;
  createdTs: number;
  fromTs: number;
  toTs: number;
  turnCount: number;
  /** Short human-readable summary used by retrieval. */
  summary: string;
  /** Compact list of recurring topic terms. */
  topics: readonly string[];
  /** Compact list of foreground app IDs that appeared. */
  apps: readonly string[];
  /** Original payload byte length (uncompressed JSON). */
  rawBytes: number;
  /** Compressed payload byte length (after gzip). */
  compressedBytes: number;
  /** Base64 gzipped JSON of the source turns; absent if compression unavailable. */
  payloadGz?: string;
}

// ===========================================================================
// Compression helpers (browser-native CompressionStream / DecompressionStream)
// ===========================================================================

function hasCompressionStream(): boolean {
  return typeof (globalThis as any).CompressionStream === 'function'
    && typeof (globalThis as any).DecompressionStream === 'function';
}

async function gzipString(input: string): Promise<Uint8Array | null> {
  if (!hasCompressionStream()) return null;
  try {
    const enc = new TextEncoder().encode(input);
    const cs = new (globalThis as any).CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(enc);
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function gunzipString(b64: string): Promise<string | null> {
  if (!hasCompressionStream()) return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ds = new (globalThis as any).DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new TextDecoder().decode(new Uint8Array(buf));
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

// ===========================================================================
// Summary heuristics -- intentionally cheap (no LLM call). Picks recurring
// nouns and short verbs across the batch, plus a one-line headline.
// ===========================================================================

const STOP = new Set('the a an and or but if then so to of for with on in at by from as is are was were be been being it this that these those i you we they me my our your their he she his her them us not no yes do does did can will would should could just like into about over under what who when where why how'.split(' '));

function topTerms(text: string, n: number): string[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];
  for (const w of words) {
    if (STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function buildSummary(turns: readonly UkiTurnRecord[]): { summary: string; topics: string[]; apps: string[] } {
  const joined = turns.map(t => `${t.user}\n${t.ukiResponse}`).join('\n');
  const topics = topTerms(joined, 8);
  const appSet = new Set<string>();
  for (const t of turns) {
    if (t.appContext?.foregroundAppId) appSet.add(t.appContext.foregroundAppId);
    for (const id of t.appContext?.openAppIds ?? []) appSet.add(id);
  }
  const first = turns[0];
  const last = turns[turns.length - 1];
  const headline = `Archive of ${turns.length} turns covering ${topics.slice(0, 3).join(', ') || 'general chat'}`;
  const range = first && last ? ` (${new Date(first.ts).toISOString().slice(0, 10)} -> ${new Date(last.ts).toISOString().slice(0, 10)})` : '';
  return { summary: headline + range, topics, apps: [...appSet] };
}

// ===========================================================================
// Public API
// ===========================================================================

export async function listArchives(): Promise<UkiArchiveRecord[]> {
  const raw = (await cache.getAsync<UkiArchiveRecord[]>(ARCHIVE_KEY)) ?? [];
  return raw.map(r => migrate(r));
}

async function writeArchives(list: UkiArchiveRecord[]): Promise<void> {
  await cache.setAsync(ARCHIVE_KEY, list.slice(-MAX_ARCHIVES), { encrypted: true });
}

/**
 * If the rolling turn window exceeds COMPRESS_THRESHOLD, consolidate the
 * oldest OLDER_BATCH into a compressed archive and trim them from the hot
 * window. Safe to call frequently; returns the new archive when one was
 * produced, otherwise null.
 */
export async function maybeConsolidate(): Promise<UkiArchiveRecord | null> {
  const turns = await readTurns();
  if (turns.length <= COMPRESS_THRESHOLD) return null;
  const batch = turns.slice(0, OLDER_BATCH);
  const remaining = turns.slice(OLDER_BATCH);
  const { summary, topics, apps } = buildSummary(batch);
  const json = JSON.stringify(batch);
  const rawBytes = json.length;
  const gz = await gzipString(json);
  const archive: UkiArchiveRecord = {
    schemaVersion: SCHEMA_VERSION,
    id: `arc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdTs: Date.now(),
    fromTs: batch[0]?.ts ?? Date.now(),
    toTs: batch[batch.length - 1]?.ts ?? Date.now(),
    turnCount: batch.length,
    summary,
    topics,
    apps,
    rawBytes,
    compressedBytes: gz ? gz.byteLength : rawBytes,
    payloadGz: gz ? bytesToBase64(gz) : undefined,
  };
  const existing = await listArchives();
  await writeArchives(existing.concat(archive));
  await cache.setAsync(TURNS_KEY, remaining, { encrypted: true });
  return archive;
}

/** Restore the original turn payload from an archive (cold lookup). */
export async function expandArchive(archive: UkiArchiveRecord): Promise<UkiTurnRecord[]> {
  if (!archive.payloadGz) return [];
  const json = await gunzipString(archive.payloadGz);
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as UkiTurnRecord[];
    return arr.map(r => migrate(r));
  } catch {
    return [];
  }
}

/**
 * Lightweight retrieval: find archives whose summary, topics, or apps match
 * the query terms. Returns at most `limit` archives ranked by overlap.
 */
export async function searchArchives(query: string, limit = 5): Promise<UkiArchiveRecord[]> {
  const terms = query.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];
  if (!terms.length) return [];
  const archives = await listArchives();
  const scored = archives.map(a => {
    const hay = `${a.summary} ${a.topics.join(' ')} ${a.apps.join(' ')}`.toLowerCase();
    const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
    return { a, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  return scored.map(x => x.a);
}

export interface CompressionStats {
  archiveCount: number;
  rawBytes: number;
  compressedBytes: number;
  ratio: number;
  oldestTs: number | null;
  newestTs: number | null;
}

export async function getCompressionStats(): Promise<CompressionStats> {
  const archives = await listArchives();
  const rawBytes = archives.reduce((s, a) => s + a.rawBytes, 0);
  const compressedBytes = archives.reduce((s, a) => s + a.compressedBytes, 0);
  return {
    archiveCount: archives.length,
    rawBytes,
    compressedBytes,
    ratio: rawBytes ? compressedBytes / rawBytes : 0,
    oldestTs: archives.length ? Math.min(...archives.map(a => a.fromTs)) : null,
    newestTs: archives.length ? Math.max(...archives.map(a => a.toTs)) : null,
  };
}

export async function clearArchives(): Promise<void> {
  await cache.remove(ARCHIVE_KEY);
}
