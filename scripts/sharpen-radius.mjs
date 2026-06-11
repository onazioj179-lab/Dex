/* =============================================================================
 * DEX Platform
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Licensed under the DEX Software License Agreement v1.0. See LICENSE.
 * =============================================================================
 * sharpen-radius.mjs — one-shot codemod that steps every hardcoded
 * border-radius in the source tree down to the sharper canonical scale
 * (xs 2 / sm 3 / md 4 / lg 6 / xl 8 / 2xl 10). Circles (%), pills (>=50px)
 * and hairlines (<=2px) are preserved. Token files that already match the
 * target scale are excluded. Run once with: node scripts/sharpen-radius.mjs
 * ========================================================================== */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOTS = ['src/renderer', 'src/main', 'src/shared', 'tests'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.html']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', 'target']);
// Files aligned by hand (token scale or already on the target scale).
const EXCLUDE_FILES = new Set([
  join('src', 'renderer', 'ui', 'CleanUI.ts'),
  join('src', 'main', 'core', 'ThemeSystem.ts'),
]);

// Old rung -> new rung. Everything else: keep (<=2, >=50) or scale ~0.72.
const MAP = {
  3: 2, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 8, 12: 10,
  13: 10, 14: 10, 15: 12, 16: 12, 17: 12, 18: 14, 19: 14, 20: 14,
  21: 16, 22: 16, 24: 16, 26: 18, 28: 20, 30: 20, 32: 22, 36: 24,
  40: 28, 48: 32,
};

function sharpen(n) {
  if (n <= 2 || n >= 50) return n;
  if (MAP[n] !== undefined) return MAP[n];
  return Math.max(2, Math.round(n * 0.72));
}

const sharpenPx = (value) =>
  value.replace(/(\d+(?:\.\d+)?)px/g, (m, num) => {
    const n = parseFloat(num);
    const s = sharpen(n);
    return s === n ? m : `${s}px`;
  });

const CAMEL_PROPS =
  'borderRadius|border(?:Top|Bottom)(?:Left|Right)Radius|border(?:Start|End)(?:Start|End)Radius';

function transform(source) {
  let changed = 0;
  const count = (before, after) => { if (before !== after) changed++; return after; };

  // 1. CSS declarations (plain CSS, HTML <style>, template-literal CSS).
  let out = source.replace(
    /(border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*)([^;}{'"`\n]+)/g,
    (m, prop, value) => count(m, prop + sharpenPx(value)),
  );

  // 2. Numeric JS style properties: borderRadius: 8  ->  borderRadius: 6
  out = out.replace(
    new RegExp(`\\b(${CAMEL_PROPS})(\\s*:\\s*)(\\d+(?:\\.\\d+)?)(?![\\d.%]|px)`, 'g'),
    (m, prop, sep2, num) => {
      const n = parseFloat(num);
      const s = sharpen(n);
      return count(m, s === n ? m : `${prop}${sep2}${s}`);
    },
  );

  // 3. String JS style properties: borderRadius: '8px 8px 0 0' -> '6px 6px 0 0'
  out = out.replace(
    new RegExp(`\\b(${CAMEL_PROPS})(\\s*:\\s*)(['"])([^'"]*)\\3`, 'g'),
    (m, prop, sep2, q, value) => count(m, `${prop}${sep2}${q}${sharpenPx(value)}${q}`),
  );

  return { out, changed };
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let totalFiles = 0;
let totalChanges = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const ext = file.slice(file.lastIndexOf('.'));
    if (!EXTENSIONS.has(ext)) continue;
    const rel = file.split(sep).join(sep);
    if ([...EXCLUDE_FILES].some((x) => rel.endsWith(x))) continue;
    const source = readFileSync(file, 'utf8');
    if (!/border-?[rR]adius|Radius\s*:/.test(source)) continue;
    const { out, changed } = transform(source);
    if (changed > 0) {
      writeFileSync(file, out, 'utf8');
      totalFiles++;
      totalChanges += changed;
      console.log(`${String(changed).padStart(4)}  ${file}`);
    }
  }
}
console.log(`\nSharpened ${totalChanges} radius declarations across ${totalFiles} files.`);
