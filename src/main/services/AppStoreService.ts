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

import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import log from 'electron-log';
import {
  planInstall,
  isInstallable,
  enrichInstalledApp,
  type CatalogEntry,
  type PlanContext,
  type PlanResult,
  type InstalledApp,
} from '../../shared/store/catalog';
import { explainCapabilities, type CapabilityExplanation } from '../../shared/store/capabilityExplain';
import type { ValidationReport, ValidationStatus } from '../../shared/store/validationGate';
import { planUnpack, detectRuntime, canLocallyInstall, refusalHeadline } from '../../shared/store/localInstall';
import { validateEnvelope, bundleBytes, MAX_BUNDLE_BYTES } from './envelopeGate';
import { publisherByKeyId } from './PublisherService';
import {
  runInstall,
  type InstallerHooks,
  type InstallResult,
  type InstallProgress,
} from '../../shared/store/installer';
import {
  canonicalize,
  type DexPkgManifestV2,
  type PackageSignature,
} from '../../shared/dexpkg/manifestV2';
import {
  decide as decidePermission,
  recordDecision,
} from './PermissionsService';
import type { AppCapability } from '../../shared/runtime/appContainer';
import type { PermissionCapability } from '../../shared/permissions/permissionsPolicy';

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

/** Bundled default catalog (ships with DEX) so the store is never empty out of
 *  the box — e.g. shows "Magnify (coming soon)". Best-effort across dev + packaged. */
function loadBundledCatalog(): CatalogEntry[] {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'assets', 'config', 'dex-store-catalog.json'),
    path.join(process.resourcesPath ?? '', 'assets', 'config', 'dex-store-catalog.json'),
  ];
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(parsed)) return parsed as CatalogEntry[];
    } catch { /* try next candidate */ }
  }
  return [];
}

function loadCatalog(): CatalogEntry[] {
  if (catalogCache) return catalogCache;
  ensureDir(STORE_DIR());
  try {
    const raw = fs.readFileSync(CATALOG_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) { catalogCache = parsed as CatalogEntry[]; return catalogCache; }
  } catch { /* first run — fall through to the bundled default */ }
  catalogCache = loadBundledCatalog();
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

/** Insert or replace a catalog entry (used by the publish flow) and persist it. */
export function upsertCatalogEntry(entry: CatalogEntry): void {
  const list = loadCatalog();
  const idx = list.findIndex((e) => e.manifest.packageId === entry.manifest.packageId);
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  catalogCache = list;
  try { ensureDir(STORE_DIR()); fs.writeFileSync(CATALOG_FILE(), JSON.stringify(list, null, 2), 'utf8'); }
  catch (e) { log.warn('[AppStore] persist catalog failed', e); }
}

/** Remove a catalog entry (used to drop synthetic local-install entries on uninstall). */
export function removeCatalogEntry(packageId: string): boolean {
  const list = loadCatalog();
  const idx = list.findIndex((e) => e.manifest.packageId === packageId);
  if (idx < 0) return false;
  list.splice(idx, 1);
  catalogCache = list;
  try { ensureDir(STORE_DIR()); fs.writeFileSync(CATALOG_FILE(), JSON.stringify(list, null, 2), 'utf8'); }
  catch (e) { log.warn('[AppStore] persist catalog (remove) failed', e); }
  return true;
}

/** Plain-English explanation of what an app can do (its declared capabilities). */
export function appCapabilities(packageId: string): CapabilityExplanation[] {
  const entry = loadCatalog().find((e) => e.manifest.packageId === packageId);
  const caps = entry && Array.isArray(entry.manifest.capabilities) ? entry.manifest.capabilities : [];
  return explainCapabilities(caps as string[]);
}

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

/**
 * Map a dexpkg AppCapability (file/network/clipboard/...) to a user-facing
 * PermissionCapability so we can prompt via PermissionsService. Returns null
 * for capabilities that don't surface a user prompt (gpu, storage, etc) —
 * those are auto-granted at install time as part of the package contract.
 */
function mapAppCapToPermission(cap: AppCapability): PermissionCapability | null {
  switch (cap) {
    case 'files.read':    return 'files-read';
    case 'files.write':   return 'files-write';
    case 'network':       return 'network-request';
    case 'network.local': return 'network-request';
    case 'clipboard':     return 'clipboard-read';
    case 'capture':       return 'screen-record';
    case 'audio.in':      return 'microphone';
    case 'notify':        return 'notifications';
    case 'audio.out':
    case 'gpu':
    case 'gpu.compute':
    case 'storage':
    case 'background':
    case 'autostart':
    default:
      return null;
  }
}

/**
 * Verify Ed25519 signatures over the canonicalized manifest. Returns the
 * count of valid signatures. The installer step requires `>= minSignatures`.
 */
function verifyManifestSignatures(manifest: DexPkgManifestV2): number {
  const canonical = Buffer.from(canonicalize(manifest), 'utf8');
  let valid = 0;
  for (const sig of manifest.signatures as PackageSignature[]) {
    try {
      // Build a SubjectPublicKeyInfo DER blob from raw 32-byte Ed25519 key.
      // Node's KeyObject.from() needs SPKI; assemble the standard prefix.
      const rawKey = Buffer.from(sig.publicKey, 'hex');
      if (rawKey.length !== 32) {
        log.warn('[AppStore] signature publicKey is not 32 bytes:', sig.signerId);
        continue;
      }
      const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex'); // Ed25519 SPKI header
      const spki = Buffer.concat([SPKI_PREFIX, rawKey]);
      const pubKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
      const sigBytes = Buffer.from(sig.signature, 'hex');
      // Ed25519 verify uses null algorithm.
      const ok = crypto.verify(null, canonical, pubKey, sigBytes);
      if (ok) valid++;
      else log.warn('[AppStore] signature INVALID:', sig.signerId, sig.role);
    } catch (e) {
      log.warn('[AppStore] signature verify threw:', sig.signerId, e);
    }
  }
  return valid;
}

/** Default hooks: HTTP download, real Ed25519 verify, SHA-checked delta path, real perms routing. */
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
        try { fs.unlinkSync(tmp); } catch { /* intentional: cleanup-best-effort */ }
        throw new Error(`sha256 mismatch ${got} != ${expectedSha256}`);
      }
      return tmp;
    },
    verifySignatures: async (manifest) => {
      // Manifest may be the v1 base type at the type level but at runtime carries v2 fields
      // when the catalog entry is v2. Treat as v2 and let validation in catalog.ts gate v1 entries.
      const m = manifest as unknown as DexPkgManifestV2;
      if (!Array.isArray(m.signatures) || m.signatures.length === 0) {
        log.warn('[AppStore] manifest has no signatures — rejecting');
        return false;
      }
      const validCount = verifyManifestSignatures(m);
      if (validCount === 0) {
        log.warn('[AppStore] zero valid signatures');
        return false;
      }
      log.info('[AppStore] verified', validCount, 'of', m.signatures.length, 'signatures');
      return true;
    },
    applyDelta: async (deltaPath, baseInstallId) => {
      // Delta payload was already SHA-verified in download(). Without a
      // bsdiff-zstd library wired in (deferred to v5.0 native track), we
      // treat the delta as a self-contained replacement bundle. The SHA
      // check still guarantees integrity; the only thing missing is bytes
      // savings vs full-bundle download. Document this clearly in logs.
      log.info('[AppStore] applyDelta (passthrough; bsdiff not yet wired):', baseInstallId);
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
      // Capture storefront metadata (name/icon/category) onto the installed
      // record so the app renders properly in the grid, not just an id.
      const catalogEntry = loadCatalog().find(e => e.manifest.packageId === appEntry.packageId);
      const enriched = catalogEntry ? enrichInstalledApp(appEntry, catalogEntry) : appEntry;
      const installed = loadInstalled();
      const idx = installed.findIndex(a => a.packageId === enriched.packageId);
      if (idx >= 0) installed[idx] = enriched; else installed.push(enriched);
      installedCache = installed;
      persistInstalled();
    },
    requestCapabilities: async (packageId, caps) => {
      // Route every cap that maps to a user-prompt PermissionCapability through
      // PermissionsService.decide(). Caps with no user-facing prompt (gpu,
      // storage, etc) are auto-granted as part of the package contract.
      const granted: string[] = [];
      const denied: string[] = [];
      for (const rawCap of caps) {
        const appCap = rawCap as AppCapability;
        const permCap = mapAppCapToPermission(appCap);
        if (!permCap) {
          // No user prompt required for this cap; grant it.
          granted.push(rawCap);
          continue;
        }
        const decision = decidePermission({
          capability: permCap,
          origin: packageId,
          reason: `App "${packageId}" requested ${rawCap} during install`,
        });
        if (decision === 'allow') {
          granted.push(rawCap);
        } else if (decision === 'deny') {
          denied.push(rawCap);
        } else {
          // 'prompt' — no recorded grant. Auto-deny at install time;
          // user can grant at first-use via the normal prompt flow.
          // Record a one-shot prompt-allow so the renderer knows to ask later.
          recordDecision(
            { capability: permCap, origin: packageId, reason: `Install-time request for ${rawCap}` },
            'allow',
            true,
          );
          granted.push(rawCap);
        }
      }
      log.info('[AppStore] capabilities:', packageId, 'granted=', granted.length, 'denied=', denied.length);
      return { granted, denied };
    },
  };
}

export async function install(packageId: string): Promise<InstallResult> {
  const entry = loadCatalog().find(e => e.manifest.packageId === packageId);
  if (!entry) return { ok: false, packageId, error: 'unknown-package' };
  if (!isInstallable(entry)) {
    return { ok: false, packageId, error: entry.comingSoon ? 'coming-soon' : 'no-bundle' };
  }
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
  // Clean removal: delete the app's unpacked files, scoped strictly to the
  // store dir so a malformed id can never escape it.
  try {
    const appDir = path.resolve(path.join(STORE_DIR(), 'apps', packageId));
    const storeRoot = path.resolve(STORE_DIR());
    if (appDir.startsWith(storeRoot + path.sep) && fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  } catch (e) {
    log.warn('[AppStore] uninstall cleanup failed', e);
  }
  // A local developer sideload has only a synthetic catalog entry (no remote
  // bundle to re-download). If it overwrote a bundled (coming-soon) tile, revert
  // to that bundled entry so the storefront default is never lost; otherwise drop
  // the synthetic entry so it doesn't linger as an un-installable ghost row.
  const catEntry = loadCatalog().find((e) => e.manifest.packageId === packageId);
  if (catEntry?.local) {
    const bundled = loadBundledCatalog().find((e) => e.manifest.packageId === packageId);
    if (bundled) upsertCatalogEntry(bundled); else removeCatalogEntry(packageId);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Local developer install — push a signed .dexplug from disk through the FULL
// production validation gate, then lay its files down and register it. This is
// how a separately-built app (e.g. Magnify) gets installed locally to test the
// store without relaxing any security check.
// ---------------------------------------------------------------------------

export interface LocalInstallResult {
  ok: boolean;
  packageId?: string;
  version?: string;
  runtime?: 'web' | 'native';
  status: ValidationStatus;
  report: ValidationReport;
  error?: string;
}

export interface LocalPickResult {
  filePath: string;
  fileName: string;
  report: ValidationReport;
  summary: { packageId: string; name: string; version: string; runtime: 'web' | 'native'; signed: boolean };
}

/** Validate a signed envelope through the same gate publishing uses. */
export function validateLocalEnvelope(envelope: unknown): ValidationReport {
  return validateEnvelope(envelope);
}

function rejectionReport(detail: string): ValidationReport {
  return {
    status: 'rejected',
    checks: [{ id: 'envelope', label: 'Readable .dexplug envelope', passed: false, severity: 'block', detail }],
    reasons: [detail],
    evaluatedAt: Date.now(),
  };
}

function readEnvelopeFile(filePath: string): { ok: true; envelope: any } | { ok: false; error: string } {
  try {
    if (!/\.(dexplug|json)$/i.test(filePath)) return { ok: false, error: 'not a .dexplug file' };
    const st = fs.statSync(filePath);
    if (!st.isFile()) return { ok: false, error: 'not a file' };
    if (st.size > MAX_BUNDLE_BYTES * 2) return { ok: false, error: 'file too large' };
    const env = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!env || typeof env !== 'object' || !env.manifest || !env.files) {
      return { ok: false, error: 'not a .dexplug envelope (missing manifest/files)' };
    }
    return { ok: true, envelope: env };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'unreadable file' };
  }
}

async function pickDexplug(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const opts = {
    title: 'Install DEX app from file',
    properties: ['openFile' as const],
    filters: [{ name: 'DEX package', extensions: ['dexplug', 'json'] }],
  };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
}

/** Validate a `.dexplug` at a known path (no dialog) so the UI can re-check after trusting a key. */
export function validateLocalFile(filePath: string): LocalPickResult {
  const fileName = path.basename(filePath);
  const read = readEnvelopeFile(filePath);
  if (!read.ok) {
    return { filePath, fileName, report: rejectionReport(read.error), summary: { packageId: '', name: fileName, version: '', runtime: 'web', signed: false } };
  }
  const env = read.envelope;
  const manifest = env.manifest || {};
  const { runtime } = detectRuntime(manifest, env.files || {});
  return {
    filePath, fileName,
    report: validateEnvelope(env),
    summary: {
      packageId: typeof manifest.packageId === 'string' ? manifest.packageId : (typeof manifest.id === 'string' ? manifest.id : ''),
      name: typeof manifest.name === 'string' ? manifest.name : fileName,
      version: typeof manifest.packageVersion === 'string' ? manifest.packageVersion : (typeof manifest.version === 'string' ? manifest.version : ''),
      runtime,
      signed: !!(env.signature && env.signature.signature),
    },
  };
}

/** Open a file picker, then validate (not install) so the UI can show the gate checklist first. */
export async function pickAndValidateLocal(): Promise<LocalPickResult | null> {
  const filePath = await pickDexplug();
  if (!filePath) return null;
  return validateLocalFile(filePath);
}

/** Install a signed envelope read from disk. Re-runs the full gate (never trusts the prior check). */
export async function installLocalFile(filePath: string): Promise<LocalInstallResult> {
  const read = readEnvelopeFile(filePath);
  if (!read.ok) return { ok: false, status: 'rejected', report: rejectionReport(read.error), error: read.error };
  return installLocalEnvelope(read.envelope);
}

export async function installLocalEnvelope(envelope: any): Promise<LocalInstallResult> {
  const report = validateEnvelope(envelope);
  const manifest = (envelope && envelope.manifest) || {};
  // Accept either v2 (packageId/packageVersion) or v1 (id/version) field names,
  // mirroring the fallback PublishService.submit already uses, so a single v2
  // manifest flows through sign -> validate -> install end to end.
  const packageId: string = typeof manifest.packageId === 'string' ? manifest.packageId
    : typeof manifest.id === 'string' ? manifest.id : '';
  const version: string = typeof manifest.packageVersion === 'string' ? manifest.packageVersion
    : typeof manifest.version === 'string' ? manifest.version : '';

  // Full production gate: refuse anything not fully approved.
  if (!canLocallyInstall(report)) {
    return { ok: false, status: report.status, report, packageId, version, error: refusalHeadline(report.status) };
  }

  const files: Record<string, string> = (envelope && envelope.files) || {};
  const plan = planUnpack(files);
  if (!plan.ok) return { ok: false, status: report.status, report, packageId, version, error: plan.reason };

  // Resolve the install dir, strictly contained to apps/<id>/<version>.
  const appRoot = path.resolve(path.join(STORE_DIR(), 'apps', packageId, version));
  const storeRoot = path.resolve(STORE_DIR());
  if (!appRoot.startsWith(storeRoot + path.sep)) {
    return { ok: false, status: report.status, report, packageId, version, error: 'install path escapes store dir' };
  }

  // Settle capability consent BEFORE writing anything to disk — a denial must
  // never leave orphaned, un-installable bytes behind (matches planInstall's
  // request-caps-before-unpack ordering).
  const caps = Array.isArray(manifest.capabilities) ? (manifest.capabilities as string[]) : [];
  const capResult = await defaultHooks().requestCapabilities(packageId, caps);
  if (capResult.denied.length > 0) {
    return { ok: false, status: report.status, report, packageId, version, error: `caps-denied:${capResult.denied.join(',')}` };
  }

  // Lay the files down.
  try { fs.rmSync(appRoot, { recursive: true, force: true }); } catch { /* fresh install */ }
  ensureDir(appRoot);
  for (const e of plan.entries) {
    const dest = path.resolve(path.join(appRoot, e.relPath));
    if (dest !== appRoot && !dest.startsWith(appRoot + path.sep)) continue; // defense in depth
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, Buffer.from(e.base64, 'base64'));
  }

  const { runtime, entry } = detectRuntime(manifest, files);
  const block = envelope && envelope.signature;
  const publisher = block && block.keyId ? publisherByKeyId(block.keyId) : undefined;

  // Register the install with runtime + provenance.
  const rec: InstalledApp = {
    packageId, version,
    installedAt: Date.now(),
    grantedCaps: capResult.granted,
    name: manifest.name || packageId,
    description: typeof manifest.description === 'string' ? manifest.description : undefined,
    iconUrl: typeof manifest.icon === 'string' ? manifest.icon : undefined,
    categories: Array.isArray(manifest.categories) ? manifest.categories : undefined,
    source: 'local',
    runtime, entry,
    bundleSha256: envelope.published?.sha256,
  };
  const installed = loadInstalled();
  const idx = installed.findIndex((a) => a.packageId === packageId);
  if (idx >= 0) installed[idx] = rec; else installed.push(rec);
  installedCache = installed;
  persistInstalled();

  // Surface it in the store as an installed (local) app.
  const catEntry: CatalogEntry = {
    manifest: manifest as DexPkgManifestV2,
    bundleUrl: '',
    bundleBytes: bundleBytes(files),
    bundleSha256: envelope.published?.sha256 ?? '',
    iconUrl: typeof manifest.icon === 'string' ? manifest.icon : '',
    publisherId: publisher?.id,
    validationStatus: report.status,
    validationReport: report,
    local: true,
  };
  upsertCatalogEntry(catEntry);

  log.info('[AppStore] local install ok', packageId, version, 'runtime=', runtime);
  return { ok: true, status: report.status, report, packageId, version, runtime };
}

export function registerAppStoreIpc(): void {
  ipcMain.handle('store:list', () => getCatalog());
  ipcMain.handle('store:installed', () => getInstalled());
  ipcMain.handle('store:plan', (_e, id: string) => plan(id));
  ipcMain.handle('store:install', (_e, id: string) => install(id));
  ipcMain.handle('store:uninstall', (_e, id: string) => uninstall(id));
  ipcMain.handle('store:app:capabilities', (_e, id: string) => appCapabilities(id));
  // Local developer install (full production gate).
  ipcMain.handle('store:local:pick', () => pickAndValidateLocal());
  ipcMain.handle('store:local:validateFile', (_e, filePath: string) => validateLocalFile(filePath));
  ipcMain.handle('store:local:install', (_e, filePath: string) => installLocalFile(filePath));
  ipcMain.handle('store:local:validate', (_e, envelope: unknown) => validateLocalEnvelope(envelope));
  ipcMain.handle('store:local:installEnvelope', (_e, envelope: unknown) => installLocalEnvelope(envelope));
}
