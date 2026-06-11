/* =============================================================================
 * DEX Platform
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Licensed under the DEX Software License Agreement v1.0. See LICENSE.
 * =============================================================================
 * audit-radius-circles.mjs — companion to sharpen-radius.mjs. Finds elements
 * whose original radius was >= half their box size (true circles and pills)
 * that the sharpening pass squared off, and restores the original radius so
 * the shape is preserved. Run: node scripts/audit-radius-circles.mjs [--fix]
 * ========================================================================== */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FIX = process.argv.includes('--fix');

const MAP = {
  3: 2, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 8, 12: 10,
  13: 10, 14: 10, 15: 12, 16: 12, 17: 12, 18: 14, 19: 14, 20: 14,
  21: 16, 22: 16, 24: 16, 26: 18, 28: 20, 30: 20, 32: 22, 36: 24,
  40: 28, 48: 32,
};
const sharpen = (n) => (n <= 2 || n >= 50 ? n : MAP[n] ?? Math.max(2, Math.round(n * 0.72)));

const files = execSync('git diff --name-only HEAD', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(tsx?|css|html)$/.test(f));

const RADIUS_RE = /\b(borderRadius:\s*'?|border-radius:\s*)(\d+)(px)?\b/g;
const dim = (lines, i, prop) => {
  // Look on the same line first, then the two lines either side.
  for (const j of [i, i - 1, i + 1, i - 2, i + 2]) {
    if (j < 0 || j >= lines.length) continue;
    const m = lines[j].match(new RegExp(`\\b${prop}:\\s*'?(\\d+)(?:px)?\\b`));
    if (m) return parseInt(m[1], 10);
  }
  return null;
};

let flagged = 0;
let fixed = 0;
for (const file of files) {
  let original;
  try {
    original = execSync(`git show HEAD:"${file}"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    continue; // new file, nothing to compare
  }
  const origLines = original.split('\n');
  const current = readFileSync(file, 'utf8');
  const curLines = current.split('\n');
  if (origLines.length !== curLines.length) continue; // codemod never changes line count

  let dirty = false;
  for (let i = 0; i < origLines.length; i++) {
    for (const m of origLines[i].matchAll(RADIUS_RE)) {
      const n = parseInt(m[2], 10);
      if (n <= 2 || n >= 50) continue;
      const mapped = sharpen(n);
      if (mapped === n) continue;
      const w = dim(origLines, i, 'width');
      const h = dim(origLines, i, 'height');
      const sizes = [w, h].filter((x) => x !== null);
      if (sizes.length === 0) continue;
      const half = Math.min(...sizes) / 2;
      // Was fully rounded before, would no longer be after sharpening.
      if (n >= half && mapped < half) {
        flagged++;
        const shape = w !== null && h !== null && w === h && n >= w / 2 ? 'circle' : 'pill';
        console.log(`${file}:${i + 1}  ${shape}  radius ${n} -> ${mapped} on ${w ?? '?'}x${h ?? '?'} box`);
        if (FIX) {
          const restored = curLines[i]
            .replace(new RegExp(`(borderRadius:\\s*')${mapped}px'`, 'g'), `$1${n}px'`)
            .replace(new RegExp(`(borderRadius:\\s*)${mapped}\\b(?!px)`, 'g'), `$1${n}`)
            .replace(new RegExp(`(border-radius:\\s*)${mapped}px`, 'g'), `$1${n}px`);
          if (restored !== curLines[i]) {
            curLines[i] = restored;
            dirty = true;
            fixed++;
          }
        }
      }
    }
  }
  if (FIX && dirty) writeFileSync(file, curLines.join('\n'), 'utf8');
}
console.log(`\n${flagged} fully-rounded shapes affected${FIX ? `, ${fixed} restored` : ' (dry run, use --fix)'}`);
