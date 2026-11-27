// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Version consistency: the app version lives in four files and a release is
// only coherent when they agree (the updater compares the installed
// tauri.conf.json version with the feed; About reads package.json).
//
//   node scripts/check-version.mjs            check all four
//   node scripts/check-version.mjs v7.0.3     also require this release tag
//
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

export function collectVersions() {
  const cargo = read('src-tauri/Cargo.toml').match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);
  return {
    'package.json': JSON.parse(read('package.json')).version,
    'package-lock.json': JSON.parse(read('package-lock.json')).version,
    'src-tauri/tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json')).version,
    'src-tauri/Cargo.toml': cargo ? cargo[1] : undefined,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const versions = collectVersions();
  const expected = versions['package.json'];
  const problems = Object.entries(versions)
    .filter(([, v]) => v !== expected)
    .map(([file, v]) => `${file} has ${v ?? 'no version'}, package.json has ${expected}`);
  const tag = process.argv[2];
  const serial = JSON.parse(read('package.json')).dexBuild;
  const buildTag = /^\d+[a-z]$/.test(serial ?? '') ? `v${expected}(${serial})` : null;
  if (tag && tag !== `v${expected}` && tag !== buildTag) problems.push(`tag ${tag} does not match version ${expected} and build ${serial}`);
  if (problems.length) {
    for (const p of problems) console.error(`version mismatch: ${p}`);
    process.exit(1);
  }
  console.log(`version ${expected} consistent across ${Object.keys(versions).length} files${tag ? ` and tag ${tag}` : ''}`);
}
