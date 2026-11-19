#!/usr/bin/env node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// All-apps stress (isolated profile, CDP). Every app DEX can open, not just the
// Browser:
//   1. each app alone: opens, renders, no crash screen, no uncaught error
//   2. every app open at once: shell stays responsive (event-loop delay), heap/DOM
//   3. open/close every app for N rounds: heap after GC must not keep growing
//
// The app list is read from AppManager's APP_COMPONENTS map, so new apps are
// covered automatically. Compact utilities (Calculator, Timer, ...) open as
// floating windows ([data-floating-window]), the rest as tabs ([data-app-id]).
//
// Usage: node scripts/perf/packaged-apps-stress.mjs --exe <dex-tauri.exe> [--rounds 3] [--out file.json]

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => { if (v.startsWith('--')) a.push([v.slice(2), all[i + 1]]); return a; }, []));
const ROUNDS = Number(args.rounds || 3);
const PORT = 9400 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// App ids from the component map (the shell can open exactly these).
const am = readFileSync(join(root, 'src/renderer/components/AppManager.tsx'), 'utf8');
const mapSrc = am.slice(am.indexOf('const APP_COMPONENTS_RAW'), am.indexOf('const APP_COMPONENTS ='));
const APPS = [...mapSrc.matchAll(/(\w+):\s*\w+[,\n]/g)].map((m) => m[1]).filter((id) => id !== 'home');

const prof = mkdtempSync(join(tmpdir(), 'dex-stress-'));
mkdirSync(join(prof, 'd')); mkdirSync(join(prof, 'w'));
const child = spawn(args.exe, [], { env: { ...process.env, DEX_DATA_DIR: join(prof, 'd'), WEBVIEW2_USER_DATA_FOLDER: join(prof, 'w'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: 'ignore' });
let main;
for (let i = 0; i < 800 && !main; i++) { try { main = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} await sleep(50); }
const ws = new WebSocket(main.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let mid = 0; const pend = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.method === 'Runtime.exceptionThrown') errors.push({ at: Date.now(), text: String(d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text).slice(0, 300) });
  else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push({ at: Date.now(), text: d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300) });
  pend.get(d.id)?.(d);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++mid; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e, timeout = 30000) => {
  const d = await Promise.race([send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }), sleep(timeout).then(() => null)]);
  return d?.result?.result?.value;
};
const metrics = async () => {
  await send('HeapProfiler.collectGarbage');
  const m = (await send('Performance.getMetrics')).result?.metrics || [];
  const g = (n) => m.find((x) => x.name === n)?.value ?? null;
  return { heapMB: Math.round((g('JSHeapUsedSize') || 0) / 1048576), domNodes: g('Nodes'), listeners: g('JSEventListeners') };
};

const OPEN = (id) => `(async () => {
  const s = window.__dexRunningApps.getState();
  const t = performance.now();
  s.launchApp({ id: ${JSON.stringify(id)}, name: ${JSON.stringify(id)}, icon: ${JSON.stringify(id)} });
  while (performance.now() - t < 15000) {
    const el = document.querySelector('[data-app-id="${id}"], [data-floating-window="${id}"]');
    if (el && el.textContent && el.textContent.trim().length > 0) return Math.round(performance.now() - t);
    await new Promise(r => setTimeout(r, 10));
  }
  return null;
})()`;
const CRASHED = (id) => `(() => { const el = document.querySelector('[data-app-id="${id}"], [data-floating-window="${id}"]'); const t = el ? el.textContent : ''; return /has crashed|Something went wrong/i.test(t || ''); })()`;
const CLOSE = (id) => `(window.__dexRunningApps.getState().closeApp(${JSON.stringify(id)}), true)`;
// Event-loop delay: how late 0 ms timers fire over `ms` (a frozen shell shows up here).
const LAG = (ms) => `(async () => { const lags = []; const end = performance.now() + ${ms};
  while (performance.now() < end) { const t = performance.now(); await new Promise(r => setTimeout(r, 0)); lags.push(performance.now() - t); }
  lags.sort((a, b) => a - b); return { p50: +lags[Math.floor(lags.length * 0.5)].toFixed(1), p99: +lags[Math.floor(lags.length * 0.99)].toFixed(1), max: +lags[lags.length - 1].toFixed(1) }; })()`;

const report = { at: new Date().toISOString(), exe: args.exe, apps: APPS.length, perApp: [], allOpen: null, rounds: [], failures: [] };
try {
  await send('Runtime.enable');
  await send('Performance.enable');
  let ready = false;
  for (let i = 0; i < 400 && !ready; i++) { ready = !!(await ev(`!!document.querySelector('[aria-label="Dock"]') && !!window.__dexRunningApps`, 2000)); if (!ready) await sleep(50); }
  // Never report passes against an error page (a debug exe whose dev server is not running).
  if (!ready) throw new Error(`DEX did not load: ${await ev('location.href')}`);
  await sleep(1500);
  errors.length = 0;
  const base = await metrics();
  report.baseline = base;

  // 1. Each app alone
  for (const id of APPS) {
    const before = errors.length;
    const ms = await ev(OPEN(id), 20000);
    await sleep(800);
    const crashed = await ev(CRASHED(id));
    const errs = errors.slice(before).map((e) => e.text);
    await ev(CLOSE(id));
    await sleep(150);
    const row = { id, launchMs: typeof ms === 'number' ? ms : null, crashed: !!crashed, errors: errs.length, firstError: errs[0] };
    report.perApp.push(row);
    const ok = typeof ms === 'number' && !crashed && errs.length === 0;
    if (!ok) report.failures.push(row);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(18)} ${typeof ms === 'number' ? ms + ' ms' : 'did not render'}${crashed ? '  CRASH SCREEN' : ''}${errs.length ? '  ' + errs.length + ' error(s): ' + errs[0].slice(0, 120) : ''}`);
  }

  // 2. Every app open at once
  {
    const before = errors.length;
    const t = Date.now();
    for (const id of APPS) await ev(`(window.__dexRunningApps.getState().launchApp({ id: ${JSON.stringify(id)}, name: ${JSON.stringify(id)}, icon: ${JSON.stringify(id)} }), true)`);
    await sleep(8000);
    const mounted = await ev(`new Set([...document.querySelectorAll('[data-app-id], [data-floating-window]')].map(e => e.getAttribute('data-app-id') || e.getAttribute('data-floating-window'))).size`);
    const crashedNow = [];
    for (const id of APPS) if (await ev(CRASHED(id))) crashedNow.push(id);
    const lag = await ev(LAG(3000));
    report.allOpen = { openedMs: Date.now() - t, mounted, crashed: crashedNow, errors: errors.length - before, lag, ...(await metrics()) };
    console.log(`all ${APPS.length} open: ${JSON.stringify(report.allOpen)}`);
    await ev(`(window.__dexRunningApps.getState().closeAllApps(), true)`);
    await sleep(2000);
  }

  // 3. Open/close rounds: heap after GC should settle, not climb every round.
  for (let r = 1; r <= ROUNDS; r++) {
    const before = errors.length;
    for (const id of APPS) { await ev(`(window.__dexRunningApps.getState().launchApp({ id: ${JSON.stringify(id)}, name: ${JSON.stringify(id)}, icon: ${JSON.stringify(id)} }), true)`); await sleep(60); }
    await sleep(3000);
    await ev(`(window.__dexRunningApps.getState().closeAllApps(), true)`);
    await sleep(2500);
    const m = await metrics();
    report.rounds.push({ round: r, errors: errors.length - before, ...m });
    console.log(`round ${r}: ${JSON.stringify(report.rounds.at(-1))}`);
  }
} catch (e) {
  report.error = String(e?.stack || e).slice(0, 500);
} finally {
  ws.close();
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  await sleep(1200);
  try { rmSync(prof, { recursive: true, force: true }); } catch {}
}

const heaps = report.rounds.map((r) => r.heapMB);
const growth = heaps.length >= 2 ? heaps.at(-1) - heaps[0] : 0;
report.verdict = {
  appsPassed: report.perApp.length - report.failures.length,
  appsFailed: report.failures.length,
  allOpenCrashes: report.allOpen?.crashed?.length ?? null,
  allOpenLagP99: report.allOpen?.lag?.p99 ?? null,
  heapGrowthAcrossRoundsMB: growth,
};
console.log(`\n${JSON.stringify(report.verdict)}`);
if (args.out) { mkdirSync(dirname(args.out), { recursive: true }); writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n'); }
process.exit(report.failures.length || report.error ? 1 : 0);
