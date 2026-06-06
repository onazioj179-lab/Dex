// =============================================================================
// DEX Platform — App Registry (persisted list of installed apps)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// id -> { manifest, installPath, dataDir, granted[] }. Persisted to
// <appsDir>/registry.json so it survives restart. Every app is confined to its
// own <appsDir>/<id> bundle + data dir — install/uninstall never touch anything
// else. Takes `appsDir` by injection (the wiring passes app.getPath('userData')/
// 'apps') so the logic is unit-testable without Electron.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppManifest, validateManifest } from './manifest';

export interface RegistryEntry {
  manifest: AppManifest;
  installPath: string;  // <appsDir>/<id>
  dataDir: string;      // <appsDir>/<id>/data
  granted: string[];    // capabilities the user granted (subset of manifest.capabilities)
  installedAt: string;
}

interface RegistryFile { apps: Record<string, RegistryEntry>; }

export class AppRegistry {
  private readonly file: string;

  constructor(private readonly appsDir: string) {
    this.appsDir = path.resolve(appsDir);
    this.file = path.join(this.appsDir, 'registry.json');
    fs.mkdirSync(this.appsDir, { recursive: true });
  }

  private load(): RegistryFile {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return parsed && typeof parsed === 'object' && parsed.apps ? parsed : { apps: {} };
    } catch {
      return { apps: {} };
    }
  }
  private save(r: RegistryFile): void {
    fs.writeFileSync(this.file, JSON.stringify(r, null, 2));
  }

  list(): RegistryEntry[] { return Object.values(this.load().apps); }
  get(id: string): RegistryEntry | null { return this.load().apps[id] ?? null; }
  has(id: string): boolean { return !!this.load().apps[id]; }

  // Validate the manifest, register the app under its own bundle dir, grant only the
  // requested capabilities the manifest actually declares. Rejects duplicate/malformed ids.
  install(manifestInput: unknown, requestedGrants: string[] = []): RegistryEntry {
    const v = validateManifest(manifestInput);
    if (!v.ok || !v.manifest) throw new Error('invalid manifest: ' + v.errors.join('; '));
    const m = v.manifest;

    const r = this.load();
    if (r.apps[m.id]) throw new Error(`app already installed: ${m.id}`);

    const installPath = path.join(this.appsDir, m.id);
    const dataDir = path.join(installPath, 'data');
    // id is validated to contain no path separators, so this stays under appsDir.
    if (!path.resolve(installPath).startsWith(this.appsDir + path.sep)) {
      throw new Error(`refusing to install outside the apps dir: ${m.id}`);
    }
    fs.mkdirSync(dataDir, { recursive: true });

    const granted = requestedGrants.filter((c) => m.capabilities.includes(c));
    const entry: RegistryEntry = { manifest: m, installPath, dataDir, granted, installedAt: new Date().toISOString() };
    r.apps[m.id] = entry;
    this.save(r);
    return entry;
  }

  // Remove from the registry and delete the bundle + its data — but ONLY within
  // <appsDir>/<id>. Anything that doesn't resolve inside the apps dir is left alone.
  uninstall(id: string): boolean {
    const r = this.load();
    const entry = r.apps[id];
    if (!entry) return false;
    const base = path.resolve(this.appsDir, id);
    if (base === path.resolve(entry.installPath) && base.startsWith(this.appsDir + path.sep)) {
      try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    delete r.apps[id];
    this.save(r);
    return true;
  }

  // Update the granted capabilities (clamped to what the manifest declares).
  setGrants(id: string, granted: string[]): boolean {
    const r = this.load();
    const entry = r.apps[id];
    if (!entry) return false;
    entry.granted = granted.filter((c) => entry.manifest.capabilities.includes(c));
    this.save(r);
    return true;
  }
}
