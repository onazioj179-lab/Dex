#!/usr/bin/env node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Writes SHA256SUMS for the official installer (NSIS setup) of the CURRENT
// version only (package.json), so stale installers from earlier builds are
// never listed. DEX ships one Windows setup; MSI is not a release format.
// Verify later with:  node scripts/release-checksums.cjs --verify
// Checksums detect corruption and tampering in transit; they are not a
// substitute for code signing (see docs/SIGNING.md).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
const sumsFile = path.join(bundleDir, 'SHA256SUMS');

function artifacts() {
  const out = [];
  const dir = path.join(bundleDir, 'nsis');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (/-setup\.exe$/i.test(f) && f.includes(`_${version}_`)) out.push(path.join('nsis', f));
    }
  }
  return out.sort();
}

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(path.join(bundleDir, file)));
  return h.digest('hex');
}

if (process.argv.includes('--verify')) {
  if (!fs.existsSync(sumsFile)) { console.error('No SHA256SUMS found. Run without --verify first.'); process.exit(1); }
  let bad = 0;
  for (const line of fs.readFileSync(sumsFile, 'utf8').split('\n').filter(Boolean)) {
    const [hash, file] = line.split(/\s+\*?/);
    const ok = fs.existsSync(path.join(bundleDir, file)) && sha256(file) === hash;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${file}`);
    if (!ok) bad++;
  }
  process.exit(bad ? 1 : 0);
}

const files = artifacts();
if (files.length === 0) {
  console.error(`No ${version} installers under ${bundleDir}. Run "npm run build:tauri" first.`);
  process.exit(1);
}
const lines = files.map((f) => `${sha256(f)} *${f.replace(/\\/g, '/')}`);
fs.writeFileSync(sumsFile, lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`\nWrote ${sumsFile}`);
