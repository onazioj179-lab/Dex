// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// WE DO NOT BREAK USERSPACE — the native IPC ABI guard.
//
// DEX's "kernel" is the native Rust backend (src-tauri); its "userspace" is the
// renderer, apps, plugins and saved automations that call it over `dex_ipc`
// channels. A channel that existed in a release is ABI: removing or renaming it
// silently breaks whatever called it (the call resolves to null and the feature
// goes dead). This guard keeps a lock file of every native channel and fails
// when one disappears, and ratchets the list of renderer calls that have no
// handler so new dead calls can't land.
//
//   node scripts/ipc-abi.mjs           check (exit 1 on a break)
//   node scripts/ipc-abi.mjs --update  rewrite the lock after an intended change
//
// Adding channels is always fine. Removing one needs a deliberate --update and
// a note in docs/NATIVE_ABI.md saying what replaced it (keep an alias arm if
// anything might still call the old name).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOCK_PATH = path.join(ROOT, 'src-tauri', 'ipc-abi.lock.json');

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'target' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

/**
 * Every channel name the native side answers: string literals in match-arm
 * position (`"ns:name" =>`, `"a:b" | "c:d" =>`, `ch @ ("x:y" | …)`, guards).
 */
export function collectNativeChannels(root = ROOT) {
  const set = new Set();
  const re = /"([a-zA-Z][\w.-]*:[\w:.-]+)"(?=\s*(?:\||=>|if\b|\)\s*=>|\)\s*\|))/g;
  // The Tauri host plus the native core crates it dispatches into (e.g. dex-ledger).
  const files = [path.join(root, 'src-tauri', 'src'), path.join(root, 'core')]
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => walk(d, ['.rs']))
    .filter((f) => !/[\\/]tests?(\.rs|[\\/])/.test(f));
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(re)) set.add(m[1]);
  }
  return set;
}

/** Channels the renderer calls with a literal name through an invoke-style wrapper. */
export function collectRendererCalls(root = ROOT) {
  const calls = new Map(); // channel -> first file
  const re = /\b(?:invoke|dexInvoke|ipcInvoke|safeInvoke|ipcSend|ipc|mutate|fileOp)\s*(?:\?\.)?\(\s*['"]([a-z][\w-]*:[\w:.-]+)['"]/g;
  for (const base of ['src/renderer', 'src/shared']) {
    const dir = path.join(root, base);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir, ['.ts', '.tsx'])) {
      if (/\.(test|spec)\.tsx?$/.test(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(re)) {
        if (!calls.has(m[1])) calls.set(m[1], path.relative(root, file).replace(/\\/g, '/'));
      }
    }
  }
  return calls;
}

/**
 * Channels the renderer serves itself (rendererShims HANDLERS + TELEMETRY_SINKS).
 * Read from source so this script needs no TS toolchain.
 */
export function collectLocalChannels(root = ROOT) {
  const file = path.join(root, 'src/renderer/services/platform/rendererShims.ts');
  const set = new Set();
  if (!fs.existsSync(file)) return set;
  const src = fs.readFileSync(file, 'utf8');
  const sinks = src.match(/TELEMETRY_SINKS\s*=\s*new Set<string>\(\[([\s\S]*?)\]\)/);
  const handlers = src.match(/const HANDLERS[^{]*\{([\s\S]*?)\n\};/);
  for (const block of [sinks?.[1], handlers?.[1]]) {
    if (!block) continue;
    for (const m of block.matchAll(/['"]([a-z][\w-]*:[\w:.-]+)['"]/g)) set.add(m[1]);
  }
  return set;
}

export function computeAbi(root = ROOT) {
  const native = collectNativeChannels(root);
  const local = collectLocalChannels(root);
  const calls = collectRendererCalls(root);
  const unhandled = [...calls.keys()].filter((c) => !native.has(c) && !local.has(c)).sort();
  return { native: [...native].sort(), local: [...local].sort(), unhandled, calls };
}

export function readLock(lockPath = LOCK_PATH) {
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

/** Compare the tree against the lock. Returns human-readable problems (empty = OK). */
export function checkAbi(abi, lock) {
  const problems = [];
  const native = new Set(abi.native);
  const removed = lock.native.filter((c) => !native.has(c));
  if (removed.length) {
    problems.push(
      `${removed.length} native channel(s) were removed — this breaks userspace: ${removed.join(', ')}. ` +
        'Restore them (or keep an alias arm), or run `npm run abi:update` and document the replacement in docs/NATIVE_ABI.md.',
    );
  }
  const known = new Set(lock.unhandledRendererCalls);
  const fresh = abi.unhandled.filter((c) => !known.has(c));
  if (fresh.length) {
    problems.push(
      `${fresh.length} new renderer call(s) to channels nothing answers: ` +
        fresh.map((c) => `${c} (${abi.calls.get(c)})`).join(', ') +
        '. Add a native arm or a rendererShims handler.',
    );
  }
  return problems;
}

function writeLock(abi) {
  const lock = {
    $comment:
      'Native IPC ABI lock (WE DO NOT BREAK USERSPACE). Generated by scripts/ipc-abi.mjs --update. ' +
      'native = every channel src-tauri answers; removing one fails CI. unhandledRendererCalls = known ' +
      'renderer calls with no handler; this list may only shrink.',
    native: abi.native,
    unhandledRendererCalls: abi.unhandled,
  };
  fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const abi = computeAbi();
  if (process.argv.includes('--update')) {
    writeLock(abi);
    console.log(`ipc-abi: lock written — ${abi.native.length} native channels, ${abi.unhandled.length} known unhandled renderer calls.`);
    process.exit(0);
  }
  if (!fs.existsSync(LOCK_PATH)) {
    console.error('ipc-abi: no lock file; run `npm run abi:update` once.');
    process.exit(1);
  }
  const lock = readLock();
  const problems = checkAbi(abi, lock);
  const gained = abi.native.length - lock.native.length;
  const fixed = lock.unhandledRendererCalls.filter((c) => !abi.unhandled.includes(c));
  if (problems.length) {
    for (const p of problems) console.error('ipc-abi: ' + p);
    process.exit(1);
  }
  console.log(
    `ipc-abi: OK — ${abi.native.length} native channels (${gained >= 0 ? '+' : ''}${gained} vs lock), ` +
      `${abi.unhandled.length} unhandled renderer calls${fixed.length ? ` (${fixed.length} fixed; run abi:update to ratchet)` : ''}.`,
  );
}
