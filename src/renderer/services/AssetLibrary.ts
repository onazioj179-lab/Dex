// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Asset Library
 * -----------------------------------------------------------------------------
 * Shared, cross-app catalog for creative assets: brushes, palettes, samples,
 * LUTs, fonts, presets. Each app contributes assets and consumes any kind it
 * understands. The library is in-memory + persistable; storage is provided by
 * the caller (so main-process or IndexedDB drivers can be plugged in later).
 *
 * Design: a typed registry keyed by AssetKind, with subscriptions so consumers
 * (Imosion sample browser, Vinx brush picker, Prism palette grid) can update
 * live when an asset is added or focused.
 *
 * Persistence: the library saves itself (debounced) to the native key-value
 * store (`capability:storage:*`, in dex.db) and to localStorage, and loads
 * itself the first time anything reads it. It used to be in-memory only with
 * "storage provided by the caller", and no caller ever provided it, so every
 * saved asset was lost on restart.
 */

import { ContextBus } from './ContextBus';
import { fuzzyMatch } from '../../shared/commands/registry';

/**
 * Universal asset kinds. The original creative kinds (brush…preset) plus the
 * "everything is an asset" content kinds (note, image, video, …, project) so a
 * single library + search spans the whole workspace. Nothing is required to
 * produce the new kinds; they are available for apps to contribute.
 */
export type AssetKind =
  | 'brush' | 'palette' | 'sample' | 'lut' | 'font' | 'preset'
  | 'note' | 'image' | 'video' | 'audio' | 'document' | 'task' | 'workflow' | 'project';

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  name: string;
  /** Owning app id ('shared' for shipped library entries). */
  ownerAppId: string;
  /** Tags for filtering. */
  tags?: string[];
  /** Optional thumbnail data URL (small -- keep <= 8 KB). */
  thumbnail?: string;
  /** Free-form payload understood by the consumer for this kind. */
  payload: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

type Listener = (assets: AssetMeta[]) => void;

interface InternalState {
  byKind: Map<AssetKind, Map<string, AssetMeta>>;
  listeners: Map<AssetKind, Set<Listener>>;
}

const state: InternalState = {
  byKind: new Map(),
  listeners: new Map(),
};

function getBucket(kind: AssetKind): Map<string, AssetMeta> {
  let b = state.byKind.get(kind);
  if (!b) { b = new Map(); state.byKind.set(kind, b); }
  return b;
}

function notify(kind: AssetKind): void {
  const subs = state.listeners.get(kind);
  if (!subs || subs.size === 0) return;
  const snapshot = Array.from(getBucket(kind).values());
  subs.forEach((l) => { try { l(snapshot); } catch (e) { console.error('[AssetLibrary]', e); } });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'dex-asset-library-v1';
let hydrateStarted = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

type Bridge = { invoke?: (channel: string, ...args: unknown[]) => Promise<unknown> };
/** Read window.dex at call time (never at module scope: it is set later in the packaged app). */
const bridge = (): Bridge | null => (typeof window !== 'undefined' ? ((window as unknown as { dex?: Bridge }).dex ?? null) : null);

function isAsset(a: unknown): a is AssetMeta {
  const x = a as AssetMeta;
  return !!x && typeof x.id === 'string' && typeof x.kind === 'string' && typeof x.name === 'string' && typeof x.payload === 'object';
}

function load(raw: unknown): AssetMeta[] {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const list = Array.isArray(data) ? data : Array.isArray((data as { assets?: unknown })?.assets) ? (data as { assets: unknown[] }).assets : [];
    return list.filter(isAsset);
  } catch { return []; }
}

/** Load saved assets once: localStorage now, then the native copy (which wins) when it arrives. */
function hydrate(): void {
  if (hydrateStarted) return;
  hydrateStarted = true;
  try {
    const local = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (local) mergeIn(load(local));
  } catch { /* storage blocked */ }
  const b = bridge();
  if (b?.invoke) {
    b.invoke('capability:storage:get', STORAGE_KEY)
      .then((raw) => { if (raw) mergeIn(load(raw)); })
      .catch(() => { /* native store unavailable: localStorage copy stands */ });
  }
}

/** Add loaded assets without overwriting anything newer already in memory. */
function mergeIn(assets: AssetMeta[]): void {
  const dirty = new Set<AssetKind>();
  for (const a of assets) {
    const cur = getBucket(a.kind).get(a.id);
    if (cur && cur.updatedAt >= a.updatedAt) continue;
    getBucket(a.kind).set(a.id, a);
    dirty.add(a.kind);
  }
  dirty.forEach(notify);
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const json = JSON.stringify(AssetLibrary.exportAll());
    try { localStorage.setItem(STORAGE_KEY, json); } catch { /* quota / blocked */ }
    const b = bridge();
    b?.invoke?.('capability:storage:set', STORAGE_KEY, json).catch(() => { /* localStorage copy stands */ });
  }, 300);
}

const newAssetId = (kind: AssetKind): string =>
  `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const AssetLibrary = {
  /** Add or replace an asset (matches by id; pass undefined id to mint one). */
  upsert(input: Omit<AssetMeta, 'createdAt' | 'updatedAt' | 'id'> & { id?: string }): AssetMeta {
    hydrate();
    const bucket = getBucket(input.kind);
    const now = Date.now();
    const id = input.id ?? newAssetId(input.kind);
    const existing = bucket.get(id);
    const asset: AssetMeta = {
      id,
      kind: input.kind,
      name: input.name,
      ownerAppId: input.ownerAppId,
      tags: input.tags,
      thumbnail: input.thumbnail,
      payload: input.payload,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    bucket.set(id, asset);
    notify(input.kind);
    schedulePersist();
    return asset;
  },

  /** Remove an asset. */
  remove(kind: AssetKind, id: string): boolean {
    const bucket = getBucket(kind);
    hydrate();
    const ok = bucket.delete(id);
    if (ok) { notify(kind); schedulePersist(); }
    return ok;
  },

  /** Get a single asset by id. */
  get(kind: AssetKind, id: string): AssetMeta | undefined {
    hydrate();
    return getBucket(kind).get(id);
  },

  /** List assets of a kind, optionally filtered by tag. */
  list(kind: AssetKind, opts?: { tag?: string; ownerAppId?: string }): AssetMeta[] {
    hydrate();
    const all = Array.from(getBucket(kind).values());
    return all.filter((a) =>
      (!opts?.tag || (a.tags ?? []).includes(opts.tag)) &&
      (!opts?.ownerAppId || a.ownerAppId === opts.ownerAppId)
    );
  },

  /** Subscribe to asset changes for a kind. Returns unsubscribe. */
  subscribe(kind: AssetKind, listener: Listener): () => void {
    hydrate();
    let set = state.listeners.get(kind);
    if (!set) { set = new Set(); state.listeners.set(kind, set); }
    set.add(listener);
    // Initial push so consumers don't have to fetch separately.
    try { listener(Array.from(getBucket(kind).values())); } catch (e) { console.error('[AssetLibrary]', e); }
    return () => { set!.delete(listener); };
  },

  /** Announce that an asset became "active" in some app. Other apps can react. */
  focus(asset: AssetMeta, source: string): void {
    try {
      ContextBus.emit('continuity:assetFocus', {
        source,
        assetId: asset.id,
        kind: asset.kind,
      });
    } catch { /* bus errors non-fatal */ }
  },

  /** Bulk import (e.g. shipped library on first run). */
  importBatch(assets: AssetMeta[]): void {
    const dirtyKinds = new Set<AssetKind>();
    for (const a of assets) {
      getBucket(a.kind).set(a.id, a);
      dirtyKinds.add(a.kind);
    }
    dirtyKinds.forEach(notify);
  },

  /** Export everything for persistence. */
  exportAll(): AssetMeta[] {
    const out: AssetMeta[] = [];
    state.byKind.forEach((bucket) => bucket.forEach((a) => out.push(a)));
    return out;
  },

  /**
   * Fuzzy-search assets across all kinds (or a subset). Pure read — this is the
   * "assets remain searchable" half of the universal asset system, and the data
   * source behind the asset search provider in the unified search.
   */
  search(query: string, opts?: { kinds?: AssetKind[]; limit?: number }): AssetMeta[] {
    hydrate();
    const q = query.trim();
    const limit = opts?.limit ?? 20;
    const kinds = opts?.kinds;
    const out: { a: AssetMeta; score: number }[] = [];
    state.byKind.forEach((bucket, kind) => {
      if (kinds && !kinds.includes(kind)) return;
      bucket.forEach((a) => {
        const hay = `${a.name} ${a.kind} ${(a.tags ?? []).join(' ')}`;
        const score = q ? fuzzyMatch(hay, q) : 1;
        if (score > 0) out.push({ a, score });
      });
    });
    return out.sort((x, y) => y.score - x.score).slice(0, limit).map((s) => s.a);
  },

  /** Test / HMR teardown. */
  _reset(): void {
    state.byKind.clear();
    state.listeners.clear();
    // A reset library stays in memory: it does not reload the saved copy.
    hydrateStarted = true;
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  },

  /** Test helper: drop memory and load the saved copy again (as after a restart). */
  _rehydrate(): void {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    state.byKind.clear();
    hydrateStarted = false;
    hydrate();
  },

  /** Write pending changes now (tests, app close). */
  flush(): void {
    if (!persistTimer) return;
    clearTimeout(persistTimer); persistTimer = null;
    const json = JSON.stringify(AssetLibrary.exportAll());
    try { localStorage.setItem(STORAGE_KEY, json); } catch { /* quota / blocked */ }
    bridge()?.invoke?.('capability:storage:set', STORAGE_KEY, json).catch(() => { /* localStorage copy stands */ });
  },
};

export default AssetLibrary;
