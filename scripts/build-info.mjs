// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX build identity (one rule, also implemented in src-tauri/build.rs):
//   version      package.json "version"            7.0.2 (installer fields use this)
//   serial       package.json "dexBuild"            001z  (owner's update label)
//   buildNumber  DEX_BUILD_NUMBER, else the number of commits reachable from
//                HEAD: only goes up along the branch, and the same source always
//                gets the same number (never random, never reused for other code)
//   buildId      <version>+build.<buildNumber>
//   commit       the source revision (12 chars), "+dirty" when uncommitted changes
//   channel      DEX_CHANNEL (development | preview | stable), default development
//   builtAt      UTC ISO time of this build
// Usage: node scripts/build-info.mjs   (prints the JSON)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const CHANNELS = new Set(['development', 'preview', 'stable']);

export function computeBuildInfo(env = process.env, now = new Date()) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = String(pkg.version || '0.0.0');
  const serial = typeof pkg.dexBuild === 'string' && /^\d+[a-z]$/.test(pkg.dexBuild) ? pkg.dexBuild : '';
  const fromEnv = Number.parseInt(env.DEX_BUILD_NUMBER || '', 10);
  const count = Number.parseInt(git('rev-list', '--count', 'HEAD'), 10);
  const buildNumber = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : Number.isFinite(count) ? count : 0;
  const sha = git('rev-parse', '--short=12', 'HEAD');
  const dirty = !!git('status', '--porcelain', '--untracked-files=no');
  const channel = CHANNELS.has(env.DEX_CHANNEL) ? env.DEX_CHANNEL : 'development';
  return {
    version,
    serial,
    buildNumber,
    buildId: buildNumber ? `${version}+build.${buildNumber}` : version,
    commit: sha ? `${sha}${dirty ? '+dirty' : ''}` : 'unknown',
    channel,
    builtAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(computeBuildInfo(), null, 2)}\n`);
}
