// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Precision UI - radius consistency snap.
//
// Snaps OFF-SCALE corner-radius literals onto the canonical DEX radius scale
// (2 / 3 / 4 / 6 / 8 / 10), so the product speaks ONE radius language instead of
// scattering random 5/7/9/11px values. Deterministic + reviewable: run it, read
// the summary, inspect `git diff`.
//
// SAFE BY CONSTRUCTION:
//   - Only maps the off-scale integers 1->2, 5->4, 7->6, 9->8, 11->10. Values
//     that are ALREADY canonical (2/3/4/6/8/10) are left untouched.
//   - Never touches circles/pills (50%, 100/999/9999px), `var(--radius-*)`,
//     SVG `rx`/`ry`, or values >= 12 (larger card radii -- a separate "is this
//     intentional?" question that needs human eyes, not a script).
//   - Skips `src/renderer/styles/**` (the canonical token definitions live there)
//     and never edits anything outside src/renderer.
//
// Usage:
//   node scripts/snap-radius-precision.mjs            # dry run (default)
//   node scripts/snap-radius-precision.mjs --write    # apply changes

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_DIR = join(ROOT, 'src', 'renderer');
const SKIP_DIR = join(ROOT, 'src', 'renderer', 'styles');
const WRITE = process.argv.includes('--write');

// Off-scale integer -> nearest canonical rung (ties step DOWN = sharper, on-brand).
const MAP = { 1: 2, 5: 4, 7: 6, 9: 8, 11: 10 };
const isMapped = (n) => Object.prototype.hasOwnProperty.call(MAP, n);

const EXTS = new Set(['.ts', '.tsx', '.css']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (full.startsWith(SKIP_DIR)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, out);
    } else {
      const dot = name.lastIndexOf('.');
      if (dot >= 0 && EXTS.has(name.slice(dot))) out.push(full);
    }
  }
  return out;
}

function snap(src) {
  let count = 0;
  const bump = (raw) => {
    const n = Number(raw);
    if (!isMapped(n)) return null;
    count++;
    return String(MAP[n]);
  };

  let out = src;
  // 1) JS numeric:  borderRadius: 5   (next char must be a non-digit, non-dot,
  //    so "50" and "5.5" never match).
  out = out.replace(/(\bborderRadius:\s*)(\d{1,2})(?=[^\d.])/g, (m, pre, num) => {
    const next = bump(num);
    return next === null ? m : pre + next;
  });
  // 2) JS string:   borderRadius: '5px'  /  "5px"
  out = out.replace(/(\bborderRadius:\s*['"])(\d{1,2})(px['"])/g, (m, pre, num, post) => {
    const next = bump(num);
    return next === null ? m : pre + next + post;
  });
  // 3) CSS / template literal:  border-radius: 5px
  out = out.replace(/(border-radius:\s*)(\d{1,2})(px)/g, (m, pre, num, post) => {
    const next = bump(num);
    return next === null ? m : pre + next + post;
  });
  return { out, count };
}

const files = walk(SCAN_DIR);
let totalSites = 0;
let totalFiles = 0;
const perFile = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const { out, count } = snap(src);
  if (count > 0) {
    totalSites += count;
    totalFiles++;
    perFile.push({ file: relative(ROOT, file).split(sep).join('/'), count });
    if (WRITE) writeFileSync(file, out);
  }
}

perFile.sort((a, b) => b.count - a.count);
console.log(`\nPrecision radius snap (${WRITE ? 'APPLIED' : 'dry run'})`);
console.log(`Map: 1->2  5->4  7->6  9->8  11->10  (canonical values untouched)\n`);
for (const { file, count } of perFile) console.log(`  ${String(count).padStart(3)}  ${file}`);
console.log(`\n${totalSites} off-scale radii across ${totalFiles} files.`);
if (!WRITE) console.log('Dry run only. Re-run with --write to apply.');
