// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Every place that turns a string into code (`new Function`, `eval`) is listed
// here with the reason it is safe. FLUX's old expression guard was a keyword
// regex that string-splitting defeated (#161), and the unused motion3d
// evaluators had the same hole; they were deleted. A new site fails this test
// until someone reviews it and adds it below.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../src');

/** file (relative to src, forward slashes) -> allowed number of sites, and why. */
const ALLOWED: Record<string, { count: number; why: string }> = {
  'renderer/DEXAPPLICATIONS/flux/expressions.ts': { count: 2, why: 'token allowlist runs before compilation (#161)' },
  'renderer/DEXAPPLICATIONS/standalone/dexCode/runtime.ts': { count: 1, why: 'runs code the user typed on purpose' },
  'renderer/components/NativeWebview.tsx': { count: 1, why: 'syntax check only, never called' },
  'renderer/services/WorkerPool.ts': { count: 3, why: "DEX's own strings, inside a worker" },
};

const SITE = /\bnew\s+Function\s*\(|(?<![.\w])eval\s*\(/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Drop comments so prose such as "NO eval()" is not counted. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

describe('dynamic code evaluation', () => {
  it('only reviewed files turn strings into code', () => {
    const found: Record<string, number> = {};
    for (const f of walk(ROOT)) {
      const n = (stripComments(fs.readFileSync(f, 'utf8')).match(SITE) ?? []).length;
      if (n) found[path.relative(ROOT, f).split(path.sep).join('/')] = n;
    }
    const expected = Object.fromEntries(Object.entries(ALLOWED).map(([k, v]) => [k, v.count]));
    expect(found).toEqual(expected);
  });
});
