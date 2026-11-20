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

  // ---- Part 24/25 native work ----------------------------------------------
  // Build identity reaches the native side.
  const build = await ev(`window.dex.invoke('corepc:getBuild')`);
  check('build identity: version+build.<n>, real commit, channel', /^\d+\.\d+\.\d+\+build\.\d+$/.test(String(build?.buildId)) && /^[0-9a-f]{12}(\+dirty)?$/.test(String(build?.commit)) && !!build?.channel, build);

  // fs:writeBase64 writes exact bytes atomically; a relative path is refused.
  {
    const target = join(prof, 'edited-copy.png').replace(/\\/g, '\\\\');
    const w = await ev(`window.dex.invoke('fs:writeBase64', '${target}', 'iVBORwAB')`);
    const rel = await ev(`window.dex.invoke('fs:writeBase64', 'relative.png', 'iVBORwAB')`);
    const { readFileSync } = await import('node:fs');
    let bytes = null; try { bytes = [...readFileSync(join(prof, 'edited-copy.png'))]; } catch {}
    check('fs:writeBase64 writes the exact bytes; relative paths refused', w?.ok === true && JSON.stringify(bytes) === JSON.stringify([0x89, 0x50, 0x4e, 0x47, 0, 1]) && rel?.ok === false, { w, rel, bytes });
  }

  // Xack: a read-only grant for a folder must not cover a chained command (#378).
  {
    const work = join(prof, 'xw'); mkdirSync(work);
    const cwd = JSON.stringify(work);
    const first = await ev(`window.dex.invoke('xack:request', { action: 'terminal.run', args: { command: 'git status', cwd: ${cwd} }, scope: ${cwd} })`);
    const dec = await ev(`window.dex.invoke('xack:decide', { requestId: ${JSON.stringify(first?.requestId)}, approve: true, remember: 'scope-read' })`);
    const plainRead = await ev(`window.dex.invoke('xack:request', { action: 'terminal.run', args: { command: 'dir', cwd: ${cwd} }, scope: ${cwd} })`);
    const chained = await ev(`window.dex.invoke('xack:request', { action: 'terminal.run', args: { command: 'dir; ri build -Recurse', cwd: ${cwd} }, scope: ${cwd} })`);
    await ev(`window.dex.invoke('xack:revoke', {})`);
    const afterRevoke = await ev(`window.dex.invoke('xack:request', { action: 'terminal.run', args: { command: 'dir', cwd: ${cwd} }, scope: ${cwd} })`);
    check('Xack: read-only grant covers plain reads, never a chained command; revoke ends it',
      first?.decision === 'ask' && dec?.ok && plainRead?.decision === 'allow' && plainRead?.by === 'grant' && chained?.decision === 'ask' && chained?.class !== 'read' && afterRevoke?.decision === 'ask',
      { first: first?.decision, plainRead: [plainRead?.decision, plainRead?.by], chained: [chained?.decision, chained?.class], afterRevoke: afterRevoke?.decision });
  }

  // Umari answers natively (projects list; retrieval or an honest not-ready).
  {
    const pr = await ev(`window.dex.invoke('umari:projects')`);
    const rt = await ev(`window.dex.invoke('umari:retrieve', { query: 'readme', limit: 3, maxChars: 500 })`);
    check('Umari: projects and bounded retrieval respond', pr?.ok === true && Array.isArray(pr.projects) && (rt?.ok === true ? rt.chars <= 500 : /index/.test(String(rt?.error))), { projects: pr?.projects?.length, retrieve: rt?.ok ? { items: rt.items.length, chars: rt.chars } : rt?.error });
  }

  // Unified window chrome: Task Manager's tabs live in the floating window's header.
  {
    await ev(`window.__dexRunningApps.getState().launchApp({ id: 'taskmanager', name: 'Task Manager', icon: 'taskmanager' }); true`);
    await sleep(2000);
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', ctrlKey: true, shiftKey: true, bubbles: true })); true`);
    let uc = null;
    for (let i = 0; i < 40 && !uc?.tabs; i++) {
      uc = await ev(`(() => { const w = document.querySelector('[data-floating-window="taskmanager"]'); if (!w) return null; const s = w.querySelector('[data-window-toolbar-slot]'); const body = w.querySelector('[data-window-body]'); return { width: Math.round(w.getBoundingClientRect().width), tabs: s ? s.querySelectorAll('[role="tab"]').length : 0, bodyTop: body ? Math.round(body.getBoundingClientRect().top - w.getBoundingClientRect().top) : null }; })()`);
      if (!uc?.tabs) await sleep(250);
    }
    check('unified chrome: Task Manager tabs in the window header, content right below it', (uc?.tabs ?? 0) >= 5 && uc?.bodyTop === 36, uc);
  }

  // Calendar alert fires from the shell service with Calendar closed.
  {
    // Start on a whole minute so the alert time (start - 15 min) lands 40-100 s
    // from now: strictly after the service's last check, never already past.
    const at = new Date(Math.ceil((Date.now() + 15 * 60_000 + 40_000) / 60_000) * 60_000);
    const pad = (n) => String(n).padStart(2, '0');
    const ev1 = { id: 'pkg-alert', title: 'Packaged alert probe', date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, time: `${pad(at.getHours())}:${pad(at.getMinutes())}`, endTime: '23:59', color: '#0A84FF', description: '', alertMinutes: 15 };
    await ev(`localStorage.setItem('dex-calendar-events', ${JSON.stringify(JSON.stringify([ev1]))}); localStorage.removeItem('dex-calendar-alerts-fired'); true`);
    let fired = [];
    for (let i = 0; i < 40 && !fired.length; i++) { await sleep(5000); fired = (await ev(`JSON.parse(localStorage.getItem('dex-calendar-alerts-fired') || '[]')`)) || []; }
    check('Calendar alert fires with Calendar closed', fired.includes(`pkg-alert@${ev1.date}`), { fired });
  }
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
