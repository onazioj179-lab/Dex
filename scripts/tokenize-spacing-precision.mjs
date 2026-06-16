// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Precision UI - spacing tokenization (makes density reach every app).
//
// The density system (design-system.css, driven by data-density via
// comfortPrefs.ts) rescales ONLY the density-responsive spacing rungs:
//   --space-2=8  --space-3=12  --space-4=16  --space-5=20
//   --space-6=24 --space-8=32  --space-10=40
// (--space-1=4 and the fractional tokens are deliberately fixed so hairline
// seams never drift.) Inline styles that hardcode those exact pixel values
// bypass density entirely. This script routes them onto the matching token, so
// compact / comfortable finally affect the creative apps.
//
// SAFE BY CONSTRUCTION:
//   - Only the SEVEN density-responsive values are mapped; everything else
//     (4px hairlines, 2/6/10/14 micro-gaps, 28/36/48 one-offs, 0) is left as-is.
//   - VISUALLY IDENTICAL at the default density (--space-4 == 16px by default);
//     the only behavioural change is that compact/comfortable now scale it.
//   - Only SPACING properties are touched (padding*/margin*/gap*). Never width,
//     height, fontSize, top/left, borderRadius, boxShadow, etc.
//   - Scoped to .tsx (React component styles). .ts is skipped so geometry/store
//     code that uses `gap`/`padding` as a *computed number* is never stringified.
//   - Skips styles/** (canonical token layer) and dist/**.
//
// Usage:
//   node scripts/tokenize-spacing-precision.mjs           # dry run (default)
//   node scripts/tokenize-spacing-precision.mjs --write    # apply

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_DIR = join(ROOT, 'src', 'renderer');
const SKIP_DIR = join(ROOT, 'src', 'renderer', 'styles');
const WRITE = process.argv.includes('--write');

// px value -> density-responsive token suffix (--space-<suffix>).
const MAP = { 8: '2', 12: '3', 16: '4', 20: '5', 24: '6', 32: '8', 40: '10' };
const tokenFor = (n) => (Object.prototype.hasOwnProperty.call(MAP, n) ? `var(--space-${MAP[n]})` : null);

const SPACING_PROPS = new Set([
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingInline', 'paddingBlock',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'gap', 'rowGap', 'columnGap', 'gridGap', 'gridRowGap', 'gridColumnGap',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (full.startsWith(SKIP_DIR)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, out);
    } else if (name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function transform(src) {
  let count = 0;

  // 1) Numeric form:  gap: 16   ->   gap: 'var(--space-4)'
  //    Lookahead requires the value to be COMPLETE: optional trailing space then
  //    a hard delimiter (, } ; newline). This rejects "160"/"16.5" (partial) AND
  //    arithmetic like "gap: 8 + x" (next real char is an operator, not a delim),
  //    so we never stringify a value that is actually computed.
  let out = src.replace(/\b([A-Za-z]+):\s*(\d{1,3})(?=\s*[,}\n;])/g, (m, prop, num) => {
    if (!SPACING_PROPS.has(prop)) return m;
    const tok = tokenFor(Number(num));
    if (!tok) return m;
    count++;
    return `${prop}: '${tok}'`;
  });

  // 2) String form (single or shorthand):  padding: '8px 16px'  ->
  //    padding: 'var(--space-2) var(--space-4)'   (0 and off-rung px untouched)
  out = out.replace(/\b([A-Za-z]+):\s*(['"])([^'"\n]*)\2/g, (m, prop, q, inner) => {
    if (!SPACING_PROPS.has(prop)) return m;
    let changed = false;
    const next = inner.replace(/\b(\d{1,3})px\b/g, (mm, n) => {
      const tok = tokenFor(Number(n));
      if (!tok) return mm;
      changed = true;
      return tok;
    });
    if (!changed) return m;
    count++;
    return `${prop}: ${q}${next}${q}`;
  });

  return { out, count };
}

const files = walk(SCAN_DIR);
let totalSites = 0;
let totalFiles = 0;
const perFile = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const { out, count } = transform(src);
  if (count > 0) {
    totalSites += count;
    totalFiles++;
    perFile.push({ file: relative(ROOT, file).split(sep).join('/'), count });
    if (WRITE) writeFileSync(file, out);
  }
}

perFile.sort((a, b) => b.count - a.count);
console.log(`\nPrecision spacing tokenization (${WRITE ? 'APPLIED' : 'dry run'})`);
console.log('Map: 8->space-2  12->space-3  16->space-4  20->space-5  24->space-6  32->space-8  40->space-10');
console.log('(only the density-responsive rungs; 4px + micro/one-off values untouched)\n');
for (const { file, count } of perFile.slice(0, 40)) console.log(`  ${String(count).padStart(4)}  ${file}`);
if (perFile.length > 40) console.log(`  ... and ${perFile.length - 40} more files`);
console.log(`\n${totalSites} spacing literals across ${totalFiles} files.`);
if (!WRITE) console.log('Dry run only. Re-run with --write to apply.');
