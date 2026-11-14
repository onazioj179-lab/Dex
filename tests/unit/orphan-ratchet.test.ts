// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Source the app never loads must not pile up again. Walks imports from the
// app entry (static, dynamic, `new URL(..., import.meta.url)`, CSS @import)
// and counts files under src/ it never reaches. 2026-11-14 (#250): 797 such
// source files (500 of them in improvements500) were removed together with
// the 271 test files that were their only users; 81 remain, still imported by
// tests that also cover live code. The count may only go down. Wire new code
// into the app, or don't add it.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const BASELINE = 81;

const SRC = /\.(tsx?|jsx?|mjs|css)$/;
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : SRC.test(e.name) && !e.name.endsWith('.d.ts') ? [join(d, e.name)] : []);

const ALIAS: [string, string][] = [['@shared', join(ROOT, 'src/shared')], ['@', join(ROOT, 'src/renderer')]];
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.css', '/index.ts', '/index.tsx', '/index.js'];
function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else {
    const a = ALIAS.find(([k]) => spec === k || spec.startsWith(k + '/'));
    if (!a) return null;
    base = join(a[1], spec.slice(a[0].length));
  }
  base = base.replace(/\?.*$/, '');
  for (const e of EXTS) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return resolve(p);
  }
  const noJs = base.replace(/\.js$/, '');
  for (const e of ['.ts', '.tsx']) if (existsSync(noJs + e)) return resolve(noJs + e);
  return null;
}

const IMPORTS = [
  /\bimport\s+(?:type\s+)?[^'"]*?\sfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?[^'"]*?\sfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
  /@import\s+(?:url\()?['"]([^'"]+)['"]/g,
];
function deps(file: string): string[] {
  const s = readFileSync(file, 'utf8');
  const out = new Set<string>();
  for (const re of IMPORTS) for (const m of s.matchAll(re)) { const r = resolveSpec(file, m[1]); if (r) out.add(r); }
  return [...out];
}

describe('orphan source ratchet', () => {
  it(`no more than ${BASELINE} files under src/ are unreachable from the app entry`, () => {
    const files = walk(join(ROOT, 'src')).map((f) => resolve(f));
    // Template-string imports cannot be followed; forbid them so the walk stays complete.
    const dynamic = files.filter((f) => /\bimport\(\s*`/.test(readFileSync(f, 'utf8')));
    expect(dynamic.map((f) => relative(ROOT, f))).toEqual([]);

    const seen = new Set<string>();
    const stack = [resolve(ROOT, 'src/renderer/main.tsx')];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const d of deps(f)) if (!seen.has(d)) stack.push(d);
    }
    const orphans = files.filter((f) => !seen.has(f)).map((f) => relative(ROOT, f).split(sep).join('/'));
    expect(orphans.length, `unreachable from src/renderer/main.tsx:\n${orphans.join('\n')}`).toBeLessThanOrEqual(BASELINE);
  }, 180_000);
});
