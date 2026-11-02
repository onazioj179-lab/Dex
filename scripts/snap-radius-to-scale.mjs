// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Snap inline numeric `borderRadius` values to the Golden Modern scale
// (0 · 4 · 6 · 10 · 14 · 18 · 24 · 9999), to the NEAREST step (ties round up,
// so the old md 8 lands on the new md 10). 0-2px hairlines and 50 (circles:
// 50% or 50px pills) are left as they are. Only `borderRadius: N` and
// `borderRadius: 'Npx'` in .tsx/.ts files are touched.
//
// Usage: node scripts/snap-radius-to-scale.mjs <file-or-dir>... [--dry]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';

export const SCALE = [0, 4, 6, 10, 14, 18, 24];
const KEEP = new Set([0, 1, 2, 50, 9999]);

/** Nearest scale step (ties round up). */
export function snapRadius(n) {
  if (KEEP.has(n)) return n;
  if (n >= 999) return 9999; // pills
  let best = 4;
  for (const s of SCALE) {
    if (s < 4) continue;
    if (Math.abs(s - n) < Math.abs(best - n) || (Math.abs(s - n) === Math.abs(best - n) && s > best)) best = s;
  }
  return best;
}

const RE = /borderRadius:\s*(['"]?)(\d+)(px)?\1(?=\s*[,}\n])/g;

export function snapSource(src) {
  let changes = 0;
  const out = src.replace(RE, (m, q, num, px) => {
    const n = Number(num);
    const s = snapRadius(n);
    if (s === n) return m;
    changes++;
    return q ? `borderRadius: ${q}${s}${px || ''}${q}` : `borderRadius: ${s}`;
  });
  return { out, changes };
}

function files(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return /\.(tsx|ts)$/.test(p) ? [p] : [];
  return fs.readdirSync(p).flatMap((f) => files(path.join(p, f)));
}

if (process.argv[1] && process.argv[1].endsWith('snap-radius-to-scale.mjs')) {
  const dry = process.argv.includes('--dry');
  let total = 0;
  for (const target of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
    for (const f of files(target)) {
      const src = fs.readFileSync(f, 'utf8');
      const { out, changes } = snapSource(src);
      if (changes) { total += changes; if (!dry) fs.writeFileSync(f, out); console.log(`${String(changes).padStart(4)}  ${f}`); }
    }
  }
  console.log(`${dry ? '[dry] ' : ''}${total} radius value(s) snapped`);
}
