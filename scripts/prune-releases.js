#!/usr/bin/env node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Cross-platform replacement for prune-releases.ps1.
// Keeps only the N newest GitHub releases on a repo and deletes the rest
// (including their tags). Uses `gh` CLI for portability across Linux, macOS,
// and Windows release runners.
//
// Usage:  node scripts/prune-releases.js --repo onazioj179-lab/Dex --keep 3
// =============================================================================
'use strict';

const { execFileSync } = require('child_process');

function parseArgs(argv) {
  const out = { repo: null, keep: 3, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') out.repo = argv[++i];
    else if (a === '--keep') out.keep = Number(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/prune-releases.js --repo <owner/name> [--keep 3] [--dry-run]');
      process.exit(0);
    }
  }
  if (!out.repo) {
    console.error('error: --repo is required');
    process.exit(2);
  }
  if (!Number.isFinite(out.keep) || out.keep < 1) {
    console.error('error: --keep must be a positive integer');
    process.exit(2);
  }
  return out;
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function main() {
  const { repo, keep, dryRun } = parseArgs(process.argv);
  let raw;
  try {
    raw = gh(['release', 'list', '--repo', repo, '--limit', '200', '--json', 'tagName,createdAt']);
  } catch (err) {
    console.error(`gh release list failed for ${repo}: ${err.message}`);
    process.exit(1);
  }
  const all = JSON.parse(raw);
  const sorted = all.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const old = sorted.slice(keep);
  if (old.length === 0) {
    console.log(`Nothing to prune on ${repo} (have ${all.length}, keep ${keep}).`);
    return;
  }
  for (const r of old) {
    if (dryRun) {
      console.log(`[dry-run] would delete ${repo} ${r.tagName}`);
      continue;
    }
    try {
      gh(['release', 'delete', r.tagName, '--repo', repo, '--yes', '--cleanup-tag']);
      console.log(`Deleted ${repo} ${r.tagName}`);
    } catch (err) {
      console.warn(`WARN: failed to delete ${r.tagName}: ${err.message}`);
    }
  }
  console.log(`Pruned ${old.length} old release(s) on ${repo}.`);
}

main();
