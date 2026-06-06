// =============================================================================
// DEX Platform — Host Services bridge (the guarded `__DEX_HOST__` handle)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Builds the services object a launched app gets. Native access is allowed ONLY
// for capabilities the registry recorded as granted, and ONLY for paths inside
// the app's own bundle + data dir — guest input is never trusted. `system` ops
// delegate to a backend the wiring injects (DEX's existing scan/info), so this
// module stays pure + unit-testable.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { RegistryEntry } from './appRegistry';

export interface SystemBackend {
  scan: (opts?: unknown) => Promise<unknown>;
  info: () => Promise<unknown>;
}

export interface HostServices {
  app: { id: string; version: string };
  capabilities: string[];
  fs: {
    read: (p: string) => Promise<string>;
    write: (p: string, data: string) => Promise<boolean>;
    copy: (src: string, dst: string) => Promise<boolean>;
    listDir: (p: string) => Promise<Array<{ name: string; dir: boolean }>>;
    pick: (opts?: { dir?: boolean }) => Promise<string | null>;
  };
  system: {
    scan: (opts?: unknown) => Promise<unknown>;
    info: () => Promise<unknown>;
  };
}

// A resolved target must live inside one of the app's allowed base dirs. Throws otherwise.
function assertInside(target: string, bases: string[]): string {
  const resolved = path.resolve(target);
  const ok = bases.some((b) => {
    const rb = path.resolve(b);
    return resolved === rb || resolved.startsWith(rb + path.sep);
  });
  if (!ok) throw new Error('path escapes the app sandbox');
  return resolved;
}

// Optional dialog hook the wiring supplies (DEX shows its native file picker in main, then this
// module re-checks the returned path against the sandbox). Defaults to "no picker".
export type PickFn = (opts?: { dir?: boolean }) => Promise<string | null>;

export function buildHostServices(entry: RegistryEntry, system: SystemBackend, pick?: PickFn): HostServices {
  const bases = [entry.installPath, entry.dataDir];
  const need = (cap: string) => {
    if (!entry.granted.includes(cap)) throw new Error(`capability not granted: ${cap}`);
  };

  return {
    app: { id: entry.manifest.id, version: entry.manifest.version },
    capabilities: entry.granted.slice(),
    fs: {
      read: async (p) => { need('fs.read'); return fs.readFileSync(assertInside(p, bases), 'utf8'); },
      write: async (p, data) => { need('fs.write'); fs.writeFileSync(assertInside(p, bases), data); return true; },
      copy: async (src, dst) => { need('fs.copy'); fs.copyFileSync(assertInside(src, bases), assertInside(dst, bases)); return true; },
      listDir: async (p) => {
        need('fs.list');
        const dir = assertInside(p, bases);
        const ents = fs.readdirSync(dir, { withFileTypes: true });
        return ents.map((e) => ({ name: e.name, dir: e.isDirectory() }));
      },
      pick: async (opts) => {
        need('fs.pick');
        const chosen = pick ? await pick(opts) : null;
        // Re-validate the picked path against the sandbox — never trust the dialog result blindly.
        if (chosen == null) return null;
        return assertInside(chosen, bases);
      },
    },
    system: {
      scan: async (opts) => { need('system.scan'); return system.scan(opts); },
      info: async () => system.info(),
    },
  };
}
