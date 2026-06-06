// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Publisher registry (DEX Developer Platform — E1). Owns the on-disk publisher
 * profiles and the linkage to the trust store: verifying a publisher adds its
 * Ed25519 signing key to dex-trust-store.json (so its apps actually verify) and
 * flips its recognition badge. Thin main-process adapter over the pure model in
 * shared/store/publisher.
 *
 * IPC:
 *   store:publisher:list                       -> PublisherProfile[]
 *   store:publisher:get      (id)              -> PublisherProfile | null
 *   store:publisher:upsert   (profile)         -> { ok, errors? }
 *   store:publisher:verify   (id, pubHex, rec) -> { ok, error? }   [DEX-team action]
 */

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import {
  validatePublisher, publisherForKeyId,
  type PublisherProfile, type Recognition,
} from '../../shared/store/publisher';
import { loadTrustStore, saveTrustStore, addKey } from '../security/trustStore';
import { keyIdForPublicKey } from '../security/codesign';

const PUBLISHERS_FILE = (): string => path.join(app.getPath('userData'), 'dex-publishers.json');
const TRUST_FILE = (): string => path.join(app.getPath('userData'), 'dex-trust-store.json');

let cache: PublisherProfile[] | null = null;

/** Magnify and the core suite ship under the first-party DEX publisher. The
 *  real signing key is added at publish time via verifyPublisher(). */
function seed(): PublisherProfile[] {
  return [{ id: 'dex.app', name: 'DEX', homepage: 'https://dex.app', keyIds: [], verified: true, recognition: 'first-party', verifiedAt: 0 }];
}

function load(): PublisherProfile[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(PUBLISHERS_FILE(), 'utf8'));
    if (Array.isArray(parsed)) { cache = parsed.filter((p) => validatePublisher(p).length === 0); return cache; }
  } catch { /* first run */ }
  cache = seed();
  persist();
  return cache;
}

function persist(): void {
  if (!cache) return;
  try { fs.mkdirSync(path.dirname(PUBLISHERS_FILE()), { recursive: true }); fs.writeFileSync(PUBLISHERS_FILE(), JSON.stringify(cache, null, 2), 'utf8'); }
  catch (e) { log.warn('[Publisher] persist failed', e); }
}

export function listPublishers(): PublisherProfile[] { return [...load()]; }
export function getPublisher(id: string): PublisherProfile | undefined { return load().find((p) => p.id === id); }
export function publisherByKeyId(keyId: string): PublisherProfile | undefined { return publisherForKeyId(load(), keyId); }

export function upsertPublisher(input: unknown): { ok: boolean; errors?: string[] } {
  const errors = validatePublisher(input);
  if (errors.length) return { ok: false, errors };
  const p = input as PublisherProfile;
  const list = load();
  const idx = list.findIndex((x) => x.id === p.id);
  if (idx >= 0) list[idx] = p; else list.push(p);
  cache = list;
  persist();
  return { ok: true };
}

/**
 * DEX-team verification: trust the publisher's signing key and grant recognition.
 * Adding the key to the trust store is what makes the publisher's signed apps
 * actually pass the install/validation gate.
 */
const RECOGNITION_LEVELS: Recognition[] = ['recognized', 'partner', 'first-party'];

export function verifyPublisher(id: string, publicKeyHex: string, recognition: Recognition = 'recognized'): { ok: boolean; error?: string } {
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex)) return { ok: false, error: 'bad-public-key' };
  // Whitelist the recognition tier — the value arrives from the renderer and is
  // TypeScript-typed only, so an out-of-band string must never reach the badge
  // (defense-in-depth against first-party-badge spoofing via the IPC boundary).
  if (!RECOGNITION_LEVELS.includes(recognition)) return { ok: false, error: 'bad-recognition' };
  const list = load();
  const p = list.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'unknown-publisher' };
  try {
    saveTrustStore(TRUST_FILE(), addKey(loadTrustStore(TRUST_FILE()), publicKeyHex, { label: id }));
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'trust-store-error' };
  }
  const keyId = keyIdForPublicKey(publicKeyHex);
  if (!p.keyIds.includes(keyId)) p.keyIds.push(keyId);
  p.verified = true;
  p.recognition = recognition;
  p.verifiedAt = Date.now();
  cache = list;
  persist();
  return { ok: true };
}

export function registerPublisherIpc(): void {
  ipcMain.handle('store:publisher:list', () => listPublishers());
  ipcMain.handle('store:publisher:get', (_e, id: string) => getPublisher(id) ?? null);
  ipcMain.handle('store:publisher:upsert', (_e, profile: unknown) => upsertPublisher(profile));
  ipcMain.handle('store:publisher:verify', (_e, id: string, publicKeyHex: string, recognition?: Recognition) =>
    verifyPublisher(id, publicKeyHex, recognition));
}
