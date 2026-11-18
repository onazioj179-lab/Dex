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

  // Background tasks: a search index run reports start and finish (index:task).
  await ev(`window.__idx = []; window.dex.on && window.dex.on('index:task', (p) => window.__idx.push(p)); true`);
  await ev(`window.dex.invoke('search:sync')`);
  let idx = [];
  for (let i = 0; i < 120; i++) { idx = (await ev('window.__idx')) || []; if (idx.some((e) => e.state !== 'started')) break; await sleep(250); }
  const fin = idx.find((e) => e.state !== 'started');
  check('search indexing reports start and finish to Background tasks', idx.some((e) => e.state === 'started') && fin?.state === 'completed', { events: idx.length, final: fin && { state: fin.state, indexed: fin.indexed, ms: fin.ms } });

  // Downloads: a chosen destination folder is used; a Windows folder is refused.
  {
    const http = await import('node:http');
    const payload = Buffer.alloc(256 * 1024, 3);
    const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': payload.length }); r.end(payload); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const destDir = join(prof, 'dl-dest'); mkdirSync(destDir);
    const url = `http://127.0.0.1:${srv.address().port}/dest-check.bin`;
    await ev(`window.__dl = []; window.dex.on && window.dex.on('download:progress', (p) => window.__dl.push(p)); true`);
    const started = await ev(`window.dex.invoke('download:start', ${JSON.stringify(url)}, 'dl_dest_1', ${JSON.stringify(destDir)})`);
    let done = null;
    for (let i = 0; i < 60 && !done; i++) { done = ((await ev('window.__dl')) || []).find((e) => e.id === 'dl_dest_1' && e.state !== 'progressing'); if (!done) await sleep(250); }
    const inDest = !!done?.path && done.path.toLowerCase().startsWith(destDir.toLowerCase());
    check('download saved into the chosen folder', started?.started === true && done?.state === 'completed' && inDest, { path: done?.path, size: done?.size });
    const refused = await ev(`window.dex.invoke('download:start', ${JSON.stringify(url)}, 'dl_dest_2', 'C:\\\\Windows')`);
    check('download into a Windows folder is refused', refused?.success === false && /can't be saved/.test(String(refused?.error)), refused);
    srv.close();
  }

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

  // Ledger (native data): capsule geometry of the Overview period control and the Budget month capsule.
  await ev(`window.__dexRunningApps.getState().launchApp({ id: 'ledger', name: 'Ledger', icon: 'ledger' }); true`);
  // A fresh (isolated) profile opens Ledger's first-run setup: create the ledger with its defaults.
  for (let i = 0; i < 40; i++) {
    const clicked = await ev(`(() => { const b = [...document.querySelectorAll('[data-app-id="ledger"] button')].find(x => /^Create ledger$/.test((x.textContent || '').trim()) && !x.disabled); if (b) { b.click(); return true; } return !!document.querySelector('[data-app-id="ledger"] .lg-segment'); })()`);
    if (clicked) break;
    await sleep(250);
  }
  await sleep(1500);
  const geo = (sel) => `(() => { const el = document.querySelector('[data-app-id="ledger"] ${sel}'); if (!el) return null;
    const o = el.getBoundingClientRect(), cs = getComputedStyle(el); const b = el.querySelector('button[aria-pressed="true"]') || el.querySelector('button');
    const r = b.getBoundingClientRect(); const inset = r.top - o.top;
    return { outerH: Math.round(o.height), outerR: parseFloat(cs.borderRadius), innerR: parseFloat(getComputedStyle(b).borderRadius), inset: Math.round(inset * 10) / 10,
      pill: Math.abs(parseFloat(cs.borderRadius) - o.height / 2) < 0.6, concentric: Math.abs(parseFloat(cs.borderRadius) - inset - parseFloat(getComputedStyle(b).borderRadius)) < 0.6 }; })()`;
  let seg = null;
  for (let i = 0; i < 60 && !seg; i++) { seg = await ev(geo('.lg-segment')); if (!seg) await sleep(250); }
  check('Ledger segmented control is a pill with a concentric highlight', seg?.pill && seg?.concentric, seg);
  // Budget view: navigate with the sidebar and measure the month capsule.
  await ev(`(() => { const b = [...document.querySelectorAll('[data-app-id="ledger"] button, [data-app-id="ledger"] a')].find(x => /^Budget$/.test((x.textContent || '').trim())); b && b.click(); return !!b; })()`);
  let month = null;
  for (let i = 0; i < 40 && !month; i++) { month = await ev(geo('.lg-month')); if (!month) await sleep(250); }
  check('Ledger month selector is one capsule with concentric buttons', month?.pill && month?.concentric, month);
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
