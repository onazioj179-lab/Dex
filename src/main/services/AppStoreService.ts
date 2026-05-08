// =============================================================================
// DEX Platform — Phase 3 host: App Store + Installer
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Mounts the catalog + installer logic onto the Electron main process.
 * IPC channels:
 *   store:list           -> CatalogEntry[]
 *   store:plan           (id) -> PlanResult | null
 *   store:install        (id) -> InstallResult
 *   store:installed      -> InstalledApp[]
 *   store:uninstall      (id) -> boolean
 *
 * Real network/signature/unpack adapters live here; pure planner +
 * step-runner come from src/shared/store and src/shared/dexpkg.
 */

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import log from 'electron-log';
import {
  planInstall,
  type CatalogEntry,
  type PlanContext,
  type PlanResult,
  type InstalledApp,
} from '../../shared/store/catalog';
import {
  runInstall,
  type InstallerHooks,
  type InstallResult,
  type InstallProgress,
} from '../../shared/store/installer';

const STORE_DIR = (): string => path.join(app.getPath('userData'), 'store');
const INSTALLED_FILE = (): string => path.join(STORE_DIR(), 'installed.json');
const CATALOG_FILE = (): string => path.join(STORE_DIR(), 'catalog.json');
const STAGING_DIR = (): string => path.join(STORE_DIR(), 'staging');
const SNAPSHOT_DIR = (): string => path.join(STORE_DIR(), 'snapshots');

let catalogCache: CatalogEntry[] | null = null;
let installedCache: InstalledApp[] | null = null;

function ensureDir(dir: string): void {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
}

function loadCatalog(): CatalogEntry[] {
  if (catalogCache) return catalogCache;
  ensureDir(STORE_DIR());
  try {
    const raw = fs.readFileSync(CATALOG_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) { catalogCache = parsed as CatalogEntry[]; return catalogCache; }
  } catch { /* first run */ }
  catalogCache = [];
  return catalogCache;
}

function loadInstalled(): InstalledApp[] {
  if (installedCache) return installedCache;
  ensureDir(STORE_DIR());
  try {
    const raw = fs.readFileSync(INSTALLED_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) { installedCache = parsed as InstalledApp[]; return installedCache; }
  } catch { /* first run */ }
  installedCache = [];
  return installedCache;
}

function persistInstalled(): void {
  if (!installedCache) return;
  try { fs.writeFileSync(INSTALLED_FILE(), JSON.stringify(installedCache, null, 2), 'utf8'); }
  catch (e) { log.warn('[AppStore] persist installed failed', e); }
}

export function getCatalog(): CatalogEntry[] { return [...loadCatalog()]; }
export function getInstalled(): InstalledApp[] { return [...loadInstalled()]; }

function buildPlanContext(): PlanContext {
  return { hostRuntime: app.getVersion(), installed: loadInstalled() };
}

export function plan(packageId: string): PlanResult | null {
  const entry = loadCatalog().find(e => e.manifest.packageId === packageId);
  if (!entry) return null;
  return planInstall(entry, buildPlanContext());
}

function sha256File(p: string): string {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

/** Default hooks: HTTP download, stub verify, fs unpack. */
function defaultHooks(): InstallerHooks {
  return {
    download: async (url, expectedSha256, _expectedBytes) => {
      ensureDir(STAGING_DIR());
      const r = await fetch(url);
      if (!r.ok) throw new Error(`download failed: ${r.status}`);
      const ab = await r.arrayBuffer();
      const buf = Buffer.from(ab);
      const tmp = path.join(STAGING_DIR(), `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.bin`);
      fs.writeFileSync(tmp, buf);
      const got = sha256File(tmp);
      if (got !== expectedSha256) {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        throw new Error(`sha256 mismatch ${got} != ${expectedSha256}`);
      }
      return tmp;
    },
    verifySignatures: async (_manifest) => {
      // TODO: route to native Ed25519 verifier (Rust). Accept for now.
      return true;
    },
    applyDelta: async (deltaPath, _baseInstallId) => {
      // TODO: real binary delta. For now treat delta as the new bundle path.
      return deltaPath;
    },
    unpack: async (bundlePath) => {
      const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-pkg-'));
      // Stub: copy single bundle to staging dir; real impl unzips/untars.
      fs.copyFileSync(bundlePath, path.join(stage, 'payload.bin'));
      return stage;
    },
    snapshotExisting: async (packageId) => {
      ensureDir(SNAPSHOT_DIR());
      const id = `${packageId}-${Date.now()}`;
      const dir = path.join(SNAPSHOT_DIR(), id);
      ensureDir(dir);
      return id;
    },
    rollback: async (packageId, snapshotId) => {
      log.warn('[AppStore] rollback', packageId, snapshotId);
    },
    register: async (appEntry) => {
      const installed = loadInstalled();
      const idx = installed.findIndex(a => a.packageId === appEntry.packageId);
      if (idx >= 0) installed[idx] = appEntry; else installed.push(appEntry);
      installedCache = installed;
      persistInstalled();
    },
    requestCapabilities: async (_packageId, caps) => {
      // TODO: route to PermissionsService for user prompts. Auto-grant for now.
      return { granted: [...caps], denied: [] };
    },
  };
}

export async function install(packageId: string): Promise<InstallResult> {
  const entry = loadCatalog().find(e => e.manifest.packageId === packageId);
  if (!entry) return { ok: false, packageId, error: 'unknown-package' };
  return runInstall(entry, buildPlanContext(), defaultHooks(), (p: InstallProgress) => {
    log.info('[AppStore] install progress', p.index, '/', p.total, p.step.kind);
  });
}

export function uninstall(packageId: string): boolean {
  const installed = loadInstalled();
  const idx = installed.findIndex(a => a.packageId === packageId);
  if (idx < 0) return false;
  installed.splice(idx, 1);
  installedCache = installed;
  persistInstalled();
  return true;
}

export function registerAppStoreIpc(): void {
  ipcMain.handle('store:list', () => getCatalog());
  ipcMain.handle('store:installed', () => getInstalled());
  ipcMain.handle('store:plan', (_e, id: string) => plan(id));
  ipcMain.handle('store:install', (_e, id: string) => install(id));
  ipcMain.handle('store:uninstall', (_e, id: string) => uninstall(id));
}
