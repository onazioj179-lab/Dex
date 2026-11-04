// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Shared renderer code is evaluated before main.tsx installs the Tauri bridge
// (static imports run first). A module-level `const x = window.dex` is therefore
// undefined in the packaged app, and the feature silently does nothing
// (Nexus Diagnostics, autosave version history, plugins, biometrics all did).
// Look the bridge up when it is used.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../src/renderer');
// App chunks load lazily, after the bridge exists; everything else may be eager.
const SKIP = new Set(['DEXAPPLICATIONS']);
const CAPTURE = /^(?:export\s+)?(?:const|let|var)\s+\w+[^=\n]*=\s*\(?\s*(?:window|globalThis)\b[^;\n]*?\.(?:dex|electron)\b(?![^;\n]*=>)/m;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(path.join(dir, e.name));
  }
  return out;
}

describe('bridge lookups', () => {
  it('no shared module captures window.dex / window.electron at load time', () => {
    const offenders: string[] = [];
    for (const f of walk(ROOT)) {
      const src = fs.readFileSync(f, 'utf8');
      src.split('\n').forEach((line, i) => {
        if (CAPTURE.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
