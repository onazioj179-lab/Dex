#!/usr/bin/env node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Packaged-build app checks (isolated profile, CDP): Part 23 features that the
// web preview cannot exercise because they need the native backend.
//   - DEX Code: Ctrl+` opens the integrated terminal and a real shell prompt appears
//   - Task Manager data: process categories (app / dex / background), startup items
//
// Usage: node scripts/perf/packaged-apps-check.mjs --exe <dex-tauri.exe> [--out file.json]

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => { if (v.startsWith('--')) a.push([v.slice(2), all[i + 1]]); return a; }, []));
const PORT = 9300 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, observed) => { results.push({ name, pass: !!pass, observed }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(observed).slice(0, 240)}`); };

const prof = mkdtempSync(join(tmpdir(), 'dex-apps-'));
mkdirSync(join(prof, 'd')); mkdirSync(join(prof, 'w'));
const child = spawn(args.exe, [], { env: { ...process.env, DEX_DATA_DIR: join(prof, 'd'), WEBVIEW2_USER_DATA_FOLDER: join(prof, 'w'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: 'ignore' });
let main;
for (let i = 0; i < 800 && !main; i++) { try { main = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} await sleep(50); }
const ws = new WebSocket(main.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pend.get(d.id)?.(d); };
const ev = (e) => new Promise((r) => { const i = ++id; pend.set(i, (d) => r(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, awaitPromise: true, returnByValue: true } })); });

try {
  for (let i = 0; i < 300; i++) { if (await ev(`!!document.querySelector('[aria-label="Dock"]')`)) break; await sleep(50); }

  // Task Manager data (native)
  const procs = await ev(`window.dex.invoke('system:getProcesses')`);
  const kinds = Array.isArray(procs) ? procs.reduce((a, p) => { a[p.kind] = (a[p.kind] || 0) + 1; return a; }, {}) : null;
  check('process list carries real categories (dex includes DEX itself)', kinds && kinds.dex >= 1 && (kinds.background ?? 0) >= 1, { total: procs?.length, kinds });
  const startup = await ev(`window.dex.invoke('system:getStartupItems')`);
  check('startup items read from Windows', startup?.success === true && Array.isArray(startup.items), { count: startup?.items?.length });

  // DEX Code integrated terminal
  await ev(`window.__dexRunningApps.getState().launchApp({ id: 'dexcode', name: 'DEX Code', icon: 'dexcode' }); true`);
  for (let i = 0; i < 100; i++) { if (await ev(`!!document.querySelector('[data-app-id="dexcode"] textarea')`)) break; await sleep(100); }
  await ev(`document.querySelector('[data-app-id="dexcode"] textarea').dispatchEvent(new KeyboardEvent('keydown', { key: '\`', code: 'Backquote', ctrlKey: true, bubbles: true })); true`);
  let text = '';
  for (let i = 0; i < 80; i++) {
    text = await ev(`(document.querySelector('[data-app-id="dexcode"] [aria-label="Problems and terminal"] .xterm-rows') || {}).textContent || ''`);
    if (/PS [A-Z]:\\|>\s*$/m.test(text)) break;
    await sleep(250);
  }
  check('Ctrl+` opens the integrated terminal with a real shell prompt', /PS [A-Z]:\\/.test(text), { prompt: text.trim().slice(-80) });
} catch (e) {
  check('apps check completed', false, String(e?.stack || e).slice(0, 300));
} finally {
  ws.close();
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  await sleep(1200);
  try { rmSync(prof, { recursive: true, force: true }); } catch {}
}
const summary = { at: new Date().toISOString(), exe: args.exe, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results };
console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
if (args.out) { mkdirSync(dirname(args.out), { recursive: true }); writeFileSync(args.out, JSON.stringify(summary, null, 2) + '\n'); }
