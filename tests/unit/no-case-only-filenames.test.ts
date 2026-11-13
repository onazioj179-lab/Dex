// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Windows and default macOS file systems are case-insensitive: two files that
// differ only by case (e.g. AssetLibrary.ts / assetLibrary.ts) overwrite each
// other on checkout and break imports. Git on Linux CI would happily store both.
const root = join(__dirname, '..', '..');
const SKIP = new Set(['node_modules', 'target', '.git', 'dist', 'release', '.vite', 'coverage']);

describe('no file names that differ only by case', () => {
  it('src, src-tauri/src, core, shared and tests are case-unique per folder', () => {
    const clashes: string[] = [];
    const walk = (dir: string) => {
      let names: string[];
      try { names = readdirSync(dir); } catch { return; }
      const seen = new Map<string, string>();
      for (const n of names) {
        const k = n.toLowerCase();
        if (seen.has(k)) clashes.push(`${dir}: ${seen.get(k)} / ${n}`); else seen.set(k, n);
        const p = join(dir, n);
        if (!SKIP.has(n) && statSync(p).isDirectory()) walk(p);
      }
    };
    for (const d of ['src', 'src-tauri/src', 'core', 'shared', 'tests']) walk(join(root, d));
    expect(clashes).toEqual([]);
  }, 60_000);
});
