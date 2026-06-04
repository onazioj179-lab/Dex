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

const newAssetId = (kind: AssetKind): string =>
  `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const AssetLibrary = {
  /** Add or replace an asset (matches by id; pass undefined id to mint one). */
  upsert(input: Omit<AssetMeta, 'createdAt' | 'updatedAt' | 'id'> & { id?: string }): AssetMeta {
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
    return asset;
  },

  /** Remove an asset. */
  remove(kind: AssetKind, id: string): boolean {
    const bucket = getBucket(kind);
    const ok = bucket.delete(id);
    if (ok) notify(kind);
    return ok;
  },

  /** Get a single asset by id. */
  get(kind: AssetKind, id: string): AssetMeta | undefined {
    return getBucket(kind).get(id);
  },

  /** List assets of a kind, optionally filtered by tag. */
  list(kind: AssetKind, opts?: { tag?: string; ownerAppId?: string }): AssetMeta[] {
    const all = Array.from(getBucket(kind).values());
    return all.filter((a) =>
      (!opts?.tag || (a.tags ?? []).includes(opts.tag)) &&
      (!opts?.ownerAppId || a.ownerAppId === opts.ownerAppId)
    );
  },

  /** Subscribe to asset changes for a kind. Returns unsubscribe. */
  subscribe(kind: AssetKind, listener: Listener): () => void {
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
  },
};

export default AssetLibrary;
