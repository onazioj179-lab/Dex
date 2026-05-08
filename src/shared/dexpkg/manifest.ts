// =============================================================================
// DEX Platform — Wave 0.4
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0.
// =============================================================================
/**
 * .dexpkg — DEX universal project container.
 *
 * Layout (zip64 conceptually; on disk it is a folder + manifest for v1, with
 * an optional zip writer):
 *
 *   <name>.dexpkg/
 *     manifest.json        — DexPkgManifest (this file's schema)
 *     project.json         — app-specific project state (small, JSON)
 *     assets/              — large binary blobs (audio, video frames, layers)
 *       <hash>.bin
 *     thumbnails/          — preview images
 *       <hash>.jpg
 *     history/             — Rewind snapshots (optional)
 *       <ts>.json
 *
 * Why folder-based first: we already use chokidar for project watching; a
 * folder is simpler to memory-map and incrementally update than a zip blob.
 * A `.dexpkg.zip` export form is added for sharing / archival.
 *
 * Backwards compat: the loader detects:
 *   - `.dexproj` (legacy single-file JSON)        -> migrate to dexpkg folder
 *   - `localStorage` namespaced keys              -> migrate to dexpkg folder
 *   - `.dexpkg` folder                            -> open natively
 *   - `.dexpkg.zip` archive                       -> extract to temp folder
 */

export const DEXPKG_VERSION = 1;
export const DEXPKG_MAGIC = 'DEXPKG';

export type DexAppId = 'imosion' | 'vinx' | 'prism' | 'flux' | 'axl' | 'standalone' | 'forge' | 'rewind' | 'nexus';

export interface DexPkgManifest {
  /** Magic constant — used for sanity-check on open. */
  magic: typeof DEXPKG_MAGIC;
  /** Format version. Bump when breaking changes are introduced. */
  formatVersion: number;
  /** App that owns this project (drives the deserializer). */
  app: DexAppId;
  /** App-specific project schema version. */
  projectVersion: number;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601 — bumped on every save. */
  modifiedAt: string;
  /** DEX app version that last wrote this. */
  writerVersion: string;
  /** Display name. */
  name: string;
  /** Optional description. */
  description?: string;
  /** Asset registry — content-addressed by SHA256. */
  assets: AssetEntry[];
  /** Thumbnail registry. */
  thumbnails: ThumbnailEntry[];
  /** Optional checksum of `project.json` for tamper detection. */
  projectSha256?: string;
}

export interface AssetEntry {
  /** SHA256 hex of the file bytes — also serves as filename in assets/. */
  sha256: string;
  /** Original file name (for export round-trip). */
  name: string;
  /** Bytes. */
  size: number;
  /** MIME type, best-effort. */
  mime: string;
  /** Optional kind hint for the app. */
  kind?: 'audio' | 'video' | 'image' | 'mesh' | 'lut' | 'shader' | 'midi' | 'other';
  /** ISO 8601 — when the asset was added. */
  addedAt: string;
}

export interface ThumbnailEntry {
  /** SHA256 of the thumbnail file. */
  sha256: string;
  /** Of which asset (or 'project' for the project hero). */
  forAsset: string | 'project';
  /** Width / height in CSS pixels. */
  width: number;
  height: number;
}

export function makeEmptyManifest(input: {
  app: DexAppId;
  name: string;
  writerVersion: string;
  projectVersion?: number;
  description?: string;
}): DexPkgManifest {
  const now = new Date().toISOString();
  return {
    magic: DEXPKG_MAGIC,
    formatVersion: DEXPKG_VERSION,
    app: input.app,
    projectVersion: input.projectVersion ?? 1,
    createdAt: now,
    modifiedAt: now,
    writerVersion: input.writerVersion,
    name: input.name,
    description: input.description,
    assets: [],
    thumbnails: [],
  };
}

export function isManifest(x: unknown): x is DexPkgManifest {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  return m.magic === DEXPKG_MAGIC
    && typeof m.formatVersion === 'number'
    && typeof m.app === 'string'
    && Array.isArray(m.assets)
    && Array.isArray(m.thumbnails);
}
