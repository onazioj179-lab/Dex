/**
 * DEX Platform -- Watermark Injection and Migration Script
 *
 * Stamps the canonical attribution header on every source file and migrates
 * any legacy anonymous banner ("Copyright (c) 2026 DEX") to the canonical
 * full-attribution form ("Copyright (c) 2026 Onazi Treasure OJ").
 *
 * Run: node scripts/add-watermarks.js [--check]
 *   --check  Exit non-zero if any file would be changed (CI gate).
 *
 * Author     Onazi Treasure OJ <onazi75@gmail.com>
 * Copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * License    DEX Software License Agreement v1.0 (commercial). See LICENSE.
 */

const fs = require('fs');
const path = require('path');

const AUTHOR_NAME = 'Onazi Treasure OJ';
const AUTHOR_EMAIL = 'onazi75@gmail.com';
const COPYRIGHT_YEAR = '2026';
const COPYRIGHT_LINE = `Copyright (c) ${COPYRIGHT_YEAR} ${AUTHOR_NAME}. All rights reserved.`;
const ATTRIBUTION_LINE = `Created by ${AUTHOR_NAME} <${AUTHOR_EMAIL}>`;
const LICENSE_LINE = 'Licensed under the DEX Software License Agreement v1.0. See LICENSE.';
const LEGACY_LICENSE_LINE = 'Licensed under the DEX Software License Agreement v1.0. See LICENSE.';

const BANNER_DSLASH = [
  '// =============================================================================',
  '// DEX Platform',
  `// ${COPYRIGHT_LINE}`,
  `// ${ATTRIBUTION_LINE}`,
  `// ${LICENSE_LINE}`,
  '// =============================================================================',
  '',
].join('\n');

const BANNER_HASH = [
  '# =============================================================================',
  '# DEX Platform',
  `# ${COPYRIGHT_LINE}`,
  `# ${ATTRIBUTION_LINE}`,
  `# ${LICENSE_LINE}`,
  '# =============================================================================',
  '',
].join('\n');

const SKIP_DIRS = new Set([
  'node_modules', 'target', 'dist', 'out', '.git', 'test-results',
  'release', 'win-unpacked', 'linux-unpacked', 'imagewallpapers',
  'appicons', '.next', 'coverage',
]);

const SKIP_FILES = new Set([
  'vite-env.d.ts',
]);

const LEGACY_BANNER_BLOCK = /^(\/\/[ =]{3,}\r?\n)?\/\/\s?DEX Platform\s?--\s?Copyright \(c\) 2026 DEX\. All rights reserved\.\s?\r?\n(\/\/[ =]{3,}\r?\n)?(\r?\n)?/;
const LEGACY_LINE_DSLASH = /\/\/\s?DEX Platform\s?--\s?Copyright \(c\) 2026 DEX\. All rights reserved\./g;
const LEGACY_LINE_INLINE = /(\*|\/\/|#)\s+Copyright \(c\) 2026 DEX\. All rights reserved\./g;

const HAS_CANONICAL = new RegExp(
  `Copyright \\(c\\) ${COPYRIGHT_YEAR} ${AUTHOR_NAME.replace(/ /g, '\\s+')}`,
  'i',
);

function getBanner(ext) {
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return BANNER_DSLASH;
  if (['.rs'].includes(ext)) return BANNER_DSLASH;
  if (['.cpp', '.cc', '.h', '.hpp', '.c'].includes(ext)) return BANNER_DSLASH;
  if (['.py', '.sh'].includes(ext)) return BANNER_HASH;
  return null;
}

function walk(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, results);
    } else if (!SKIP_FILES.has(entry.name)) {
      const ext = path.extname(entry.name);
      if (getBanner(ext)) results.push(full);
    }
  }
  return results;
}

function migrate(content, banner) {
  let out = content;
  let changed = false;

  if (LEGACY_BANNER_BLOCK.test(out)) {
    out = out.replace(LEGACY_BANNER_BLOCK, '');
    changed = true;
  }

  const beforeDslash = out;
  out = out.replace(LEGACY_LINE_DSLASH, `// DEX Platform -- ${COPYRIGHT_LINE}`);
  if (out !== beforeDslash) changed = true;

  const beforeInline = out;
  out = out.replace(LEGACY_LINE_INLINE, (_m, lead) => `${lead} ${COPYRIGHT_LINE}`);
  if (out !== beforeInline) changed = true;

  const beforeMit = out;
  out = out.split(LEGACY_LICENSE_LINE).join(LICENSE_LINE);
  if (out !== beforeMit) changed = true;

  if (!HAS_CANONICAL.test(out.slice(0, 1200))) {
    out = banner + out.replace(/^\s*/, '');
    changed = true;
  }

  return { out, changed };
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const root = path.resolve(__dirname, '..');
const dirs = [
  path.join(root, 'src'),
  path.join(root, 'native', 'src'),
  path.join(root, 'scripts'),
  path.join(root, 'tests'),
  path.join(root, 'docs-site'),
];

let migrated = 0;
let stamped = 0;
let untouched = 0;
let scanned = 0;
let needsCount = 0;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    scanned++;
    const banner = getBanner(path.extname(file));
    if (!banner) { untouched++; continue; }
    const original = fs.readFileSync(file, 'utf8');
    if (original.length < 20) { untouched++; continue; }
    const wasLegacy = LEGACY_LINE_DSLASH.test(original) || LEGACY_LINE_INLINE.test(original) || LEGACY_BANNER_BLOCK.test(original);
    LEGACY_LINE_DSLASH.lastIndex = 0;
    LEGACY_LINE_INLINE.lastIndex = 0;
    const { out, changed } = migrate(original, banner);
    if (!changed) { untouched++; continue; }
    needsCount++;
    if (checkOnly) {
      console.log(`  ! ${path.relative(root, file).replace(/\\/g, '/')}`);
    } else {
      fs.writeFileSync(file, out, 'utf8');
      console.log(`  ${wasLegacy ? '~' : '+'} ${path.relative(root, file).replace(/\\/g, '/')}`);
      if (wasLegacy) migrated++; else stamped++;
    }
  }
}

if (checkOnly) {
  if (needsCount > 0) {
    console.error(`\nWatermark check FAILED: ${needsCount} file(s) need attribution. Run: node scripts/add-watermarks.js`);
    process.exit(1);
  }
  console.log(`\nWatermark check OK: ${scanned} files in compliance.`);
} else {
  console.log(`\nDone: ${migrated} migrated, ${stamped} stamped, ${untouched} already canonical, ${scanned} scanned.`);
}
