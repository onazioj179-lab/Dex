// =============================================================================
// DEX Platform — Wave 0.4
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0.
// =============================================================================
/**
 * DexPkgWriter / DexPkgReader — folder-based reader/writer for `.dexpkg`
 * project containers. Pure Node fs (no native deps).
 *
 * Single-call helpers:
 *   - createPackage(dir, manifestInput, projectJson)
 *   - openPackage(dir)
 *   - addAsset(dir, srcPath | Buffer)
 *   - removeAsset(dir, sha256)
 *   - saveProject(dir, projectJson)
 *
 * Atomicity: writes go to `<file>.tmp` then rename into place. Manifest is
 * always written last so partial writes fail closed.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  DEXPKG_VERSION, isManifest, makeEmptyManifest,
  type AssetEntry, type DexPkgManifest, type DexAppId,
} from './manifest';

const MANIFEST_FILE = 'manifest.json';
const PROJECT_FILE = 'project.json';
const ASSETS_DIR = 'assets';
const THUMBS_DIR = 'thumbnails';
const HISTORY_DIR = 'history';

export interface OpenedPackage {
  dir: string;
  manifest: DexPkgManifest;
  /** Returns parsed project.json. */
  readProject<T = unknown>(): Promise<T>;
}

export async function createPackage(input: {
  dir: string;
  app: DexAppId;
  name: string;
  writerVersion: string;
  projectJson?: unknown;
  description?: string;
  projectVersion?: number;
}): Promise<OpenedPackage> {
  const { dir } = input;
  await fs.mkdir(path.join(dir, ASSETS_DIR), { recursive: true });
  await fs.mkdir(path.join(dir, THUMBS_DIR), { recursive: true });
  await fs.mkdir(path.join(dir, HISTORY_DIR), { recursive: true });

  const projJson = input.projectJson ?? {};
  const projStr = JSON.stringify(projJson, null, 2);
  await atomicWrite(path.join(dir, PROJECT_FILE), projStr);

  const manifest = makeEmptyManifest({
    app: input.app, name: input.name, writerVersion: input.writerVersion,
    projectVersion: input.projectVersion, description: input.description,
  });
  manifest.projectSha256 = sha256Str(projStr);
  await writeManifest(dir, manifest);
  return openPackage(dir);
}

export async function openPackage(dir: string): Promise<OpenedPackage> {
  const m = await readManifest(dir);
  if (m.formatVersion > DEXPKG_VERSION) {
    throw new Error(`dexpkg: format v${m.formatVersion} is newer than supported v${DEXPKG_VERSION}`);
  }
  return {
    dir,
    manifest: m,
    async readProject<T>(): Promise<T> {
      const buf = await fs.readFile(path.join(dir, PROJECT_FILE), 'utf8');
      return JSON.parse(buf) as T;
    },
  };
}

export async function saveProject(dir: string, projectJson: unknown): Promise<void> {
  const projStr = JSON.stringify(projectJson, null, 2);
  await atomicWrite(path.join(dir, PROJECT_FILE), projStr);
  const m = await readManifest(dir);
  m.modifiedAt = new Date().toISOString();
  m.projectSha256 = sha256Str(projStr);
  await writeManifest(dir, m);
}

export async function addAsset(input: {
  dir: string;
  src: Buffer | string; // Buffer or absolute path
  name: string;
  mime: string;
  kind?: AssetEntry['kind'];
}): Promise<AssetEntry> {
  const buf = typeof input.src === 'string' ? await fs.readFile(input.src) : input.src;
  const hash = sha256Buf(buf);
  const target = path.join(input.dir, ASSETS_DIR, hash + path.extname(input.name));
  // Skip write if already present (content-addressed dedupe)
  try {
    await fs.access(target);
  } catch {
    await atomicWriteBuffer(target, buf);
  }
  const m = await readManifest(input.dir);
  const existing = m.assets.find(a => a.sha256 === hash);
  if (existing) return existing;
  const entry: AssetEntry = {
    sha256: hash, name: input.name, size: buf.byteLength, mime: input.mime,
    kind: input.kind, addedAt: new Date().toISOString(),
  };
  m.assets.push(entry);
  m.modifiedAt = entry.addedAt;
  await writeManifest(input.dir, m);
  return entry;
}

export async function removeAsset(dir: string, sha256: string): Promise<boolean> {
  const m = await readManifest(dir);
  const i = m.assets.findIndex(a => a.sha256 === sha256);
  if (i === -1) return false;
  const entry = m.assets[i]!;
  m.assets.splice(i, 1);
  m.modifiedAt = new Date().toISOString();
  await writeManifest(dir, m);
  // Try to delete the file (may have multiple extensions; brute-force scan)
  const assetsDir = path.join(dir, ASSETS_DIR);
  const files = await fs.readdir(assetsDir).catch(() => [] as string[]);
  for (const f of files) {
    if (f.startsWith(sha256)) {
      await fs.unlink(path.join(assetsDir, f)).catch(() => undefined);
    }
  }
  return true;
}

export async function assetPath(dir: string, sha256: string): Promise<string | null> {
  const assetsDir = path.join(dir, ASSETS_DIR);
  const files = await fs.readdir(assetsDir).catch(() => [] as string[]);
  for (const f of files) {
    if (f.startsWith(sha256)) return path.join(assetsDir, f);
  }
  return null;
}

// ---------- internals ----------

async function readManifest(dir: string): Promise<DexPkgManifest> {
  const raw = await fs.readFile(path.join(dir, MANIFEST_FILE), 'utf8');
  const parsed = JSON.parse(raw);
  if (!isManifest(parsed)) throw new Error('dexpkg: invalid manifest');
  return parsed;
}

async function writeManifest(dir: string, m: DexPkgManifest): Promise<void> {
  await atomicWrite(path.join(dir, MANIFEST_FILE), JSON.stringify(m, null, 2));
}

async function atomicWrite(target: string, content: string): Promise<void> {
  const tmp = target + '.tmp';
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, target);
}

async function atomicWriteBuffer(target: string, content: Buffer): Promise<void> {
  const tmp = target + '.tmp';
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, target);
}

function sha256Buf(b: Buffer): string {
  return crypto.createHash('sha256').update(b).digest('hex');
}
function sha256Str(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
