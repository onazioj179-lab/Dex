#!/usr/bin/env node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Packaged-build performance probe (Windows). Repeatable before/after numbers
// for the release exe, on an ISOLATED profile (never the owner's data):
//
//   cold start  -> spawn to CDP page, DOM ready, shell store ready, first paint
//   warm start  -> same, second launch on the same (now warm) profile
//   app launch  -> launchApp() to the app's window having content, per app
//   multi-app   -> N apps launched back to back, total + per app
//   idle cost   -> CPU % of one core and memory (exe + its WebView2 processes)
//   browser     -> a saved session of T tabs: live page targets + memory
//
// Usage:
//   node scripts/perf/packaged-probe.mjs --exe <path\to\dex-tauri.exe> [--label before]
//        [--tabs 100] [--out docs/reports/perf/<label>.json]
//
// Prints a JSON report. Nothing here is estimated: a step that fails or times
// out is reported as null with its error.

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, cpus, totalmem, release } from 'node:os';
import { join, dirname, basename } from 'node:path';
import http from 'node:http';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return a;
}, []));
const EXE = args.exe;
if (!EXE) { console.error('--exe is required'); process.exit(2); }
const LABEL = args.label || 'run';
const TABS = Number(args.tabs || 100);
const PORT = 9400 + Math.floor(Math.random() * 400);
const APPS = (args.apps || 'notes,files,settings,ledger,calculator,calendar,tasks,dexcode').split(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- tiny local page server (offline, deterministic tab content) ------------
function startPageServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      // ~1 MB of DOM + a 4 MB array per page: a modest "real" page.
      res.end(`<!doctype html><title>Tab ${req.url}</title><body><h1>${req.url}</h1>
<script>window.__blob=new Array(1<<20).fill(1);document.body.insertAdjacentHTML('beforeend','<p>x</p>'.repeat(20000));</script>`);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// ---- CDP -------------------------------------------------------------------
async function json(path) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return r.json();
}
async function waitForMainTarget(timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const list = await json('/json/list');
      const main = list.find((t) => t.type === 'page' && /tauri\.localhost|localhost|tauri:/.test(t.url));
      if (main) return { main, list };
    } catch { /* not up yet */ }
    await sleep(50);
  }
  throw new Error('no CDP page target');
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    };
    ws.onerror = reject;
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }),
      close: () => ws.close(),
    });
  });
}
async function evaluate(cdp, expression, timeoutMs = 30000) {
  const r = await Promise.race([
    cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
    sleep(timeoutMs).then(() => ({ timeout: true })),
  ]);
  if (r.timeout) throw new Error('evaluate timed out');
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exception');
  return r.result?.result?.value;
}

// ---- processes ---------------------------------------------------------------
function processSample(rootPid, profileDir) {
  // exe + every msedgewebview2 whose command line names our private profile.
  const ps = `
$p = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${rootPid} -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*${basename(profileDir)}*') }
$p | ForEach-Object { "{0}|{1}|{2}|{3}" -f $_.ProcessId, ($_.KernelModeTime + $_.UserModeTime), $_.WorkingSetSize, $_.PrivatePageCount }`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  const rows = out.trim().split(/\r?\n/).filter(Boolean).map((l) => l.split('|').map(Number));
  return {
    count: rows.length,
    cpu100ns: rows.reduce((s, r) => s + r[1], 0),
    workingSetMB: Math.round(rows.reduce((s, r) => s + r[2], 0) / 1048576),
    privateMB: Math.round(rows.reduce((s, r) => s + r[3], 0) / 1048576),
  };
}
async function idleCost(pid, profile, seconds = 15) {
  const a = processSample(pid, profile);
  const t = Date.now();
  await sleep(seconds * 1000);
  const b = processSample(pid, profile);
  const wall = (Date.now() - t) * 1e4; // ms -> 100 ns
  return { cpuPctOfOneCore: +(((b.cpu100ns - a.cpu100ns) / wall) * 100).toFixed(1), processes: b.count, workingSetMB: b.workingSetMB, privateMB: b.privateMB };
}

// ---- one launch -------------------------------------------------------------
async function launch(dataDir, wvDir) {
  const t0 = Date.now();
  const child = spawn(EXE, [], {
    env: {
      ...process.env,
      DEX_DATA_DIR: dataDir,
      WEBVIEW2_USER_DATA_FOLDER: wvDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
    stdio: 'ignore',
  });
  const { main } = await waitForMainTarget();
  const tCdp = Date.now() - t0;
  const cdp = await connect(main.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  let tShell = null;
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    try {
      // Desktop usable = the shell store exists and the Dock has rendered.
      if (await evaluate(cdp, `!!(window.__dexRunningApps && document.querySelector('[aria-label="Dock"]'))`, 2000)) { tShell = Date.now() - t0; break; }
    } catch { /* page reloading */ }
    await sleep(25);
  }
  const page = await evaluate(cdp, `(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
    return { domContentLoadedMs: n ? Math.round(n.domContentLoadedEventEnd) : null, loadMs: n ? Math.round(n.loadEventEnd) : null, firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null,
      jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, domNodes: document.getElementsByTagName('*').length };
  })()`);
  return { child, cdp, timings: { spawnToCdpMs: tCdp, spawnToDesktopUsableMs: tShell, ...page } };
}

const LAUNCH_ONE = (id) => `(async () => {
  const s = window.__dexRunningApps.getState();
  const t = performance.now();
  s.launchApp({ id: ${JSON.stringify(id)}, name: ${JSON.stringify(id)}, icon: ${JSON.stringify(id)} });
  const end = t + 15000;
  while (performance.now() < end) {
    const el = document.querySelector('[data-app-id="${id}"]');
    // textContent, not innerText or rAF: both stall or read empty while the
    // DEX window is covered by another window.
    if (el && el.textContent && el.textContent.trim().length > 0) return Math.round(performance.now() - t);
    await new Promise(r => setTimeout(r, 4));
  }
  return null;
})()`;

async function kill(child) {
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  await sleep(1500);
}

// ---- main -------------------------------------------------------------------
const profile = mkdtempSync(join(tmpdir(), 'dex-probe-'));
const dataDir = join(profile, 'data');
const wvDir = join(profile, 'wv2');
mkdirSync(dataDir); mkdirSync(wvDir);
const report = {
  label: LABEL, exe: EXE, at: new Date().toISOString(),
  machine: { os: `Windows ${release()}`, cpu: cpus()[0]?.model, logicalCores: cpus().length, ramGB: Math.round(totalmem() / 2 ** 30) },
  method: 'release exe, isolated DEX_DATA_DIR + WebView2 profile, driven over CDP; timings are wall clock from process spawn',
};
const srv = await startPageServer();
const base = `http://127.0.0.1:${srv.address().port}`;
try {
  // Cold
  let run = await launch(dataDir, wvDir);
  report.cold = run.timings;
  await sleep(15000); // past boot work, so this is idle
  report.idleShell = await idleCost(run.child.pid, wvDir);

  // App launch latency, one at a time (each app is new to this profile)
  report.appLaunchMs = {};
  for (const id of APPS) {
    try { report.appLaunchMs[id] = await evaluate(run.cdp, LAUNCH_ONE(id), 20000); } catch (e) { report.appLaunchMs[id] = null; }
    await sleep(300);
  }
  await sleep(15000);
  report.idleWithApps = { apps: APPS.length, ...(await idleCost(run.child.pid, wvDir)) };

  // What the renderer does while "idle" with those apps open: a 10 s CPU
  // profile of the shell page, self time bucketed by function + script line,
  // plus timer/frame counts (wrapped for the same 10 s).
  if (args.profile !== 'false') {
    await run.cdp.send('Profiler.enable');
    await run.cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await evaluate(run.cdp, `(() => {
      const c = window.__probeCounts = { raf: {}, timeout: {}, interval: {} };
      const where = () => { const l = (new Error().stack || '').split('\\n')[3] || ''; return l.trim().slice(0, 160); };
      const wrap = (name, key) => { const o = window[name]; window['__orig_' + name] = o; window[name] = function (fn, ...a) { const w = where(); c[key][w] = (c[key][w] || 0) + 1; return o.call(window, fn, ...a); }; };
      wrap('requestAnimationFrame', 'raf'); wrap('setTimeout', 'timeout'); wrap('setInterval', 'interval');
      return true;
    })()`);
    await run.cdp.send('Profiler.start');
    await sleep(10000);
    const { result } = await run.cdp.send('Profiler.stop');
    const prof = result.profile;
    const dt = new Map();
    prof.samples.forEach((id, i) => dt.set(id, (dt.get(id) || 0) + (prof.timeDeltas[i] || 0)));
    const byFn = new Map();
    let total = 0;
    for (const n of prof.nodes) {
      const us = dt.get(n.id) || 0;
      const f = n.callFrame;
      if (f.functionName === '(idle)' || f.functionName === '(program)') continue;
      total += us;
      const k = `${f.functionName || '(anon)'} ${(f.url || '').split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
      byFn.set(k, (byFn.get(k) || 0) + us);
    }
    const counts = await evaluate(run.cdp, `(() => { const c = window.__probeCounts; const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8);
      for (const n of ['requestAnimationFrame','setTimeout','setInterval']) window[n] = window['__orig_' + n];
      return { raf: top(c.raf), timeout: top(c.timeout), interval: top(c.interval) }; })()`).catch(() => null);
    report.idleProfile = {
      busyMsIn10s: Math.round(total / 1000),
      topSelfTime: [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, us]) => [k, Math.round(us / 1000)]),
      scheduled: counts,
    };
  }

  run.cdp.close();
  await kill(run.child);

  // Warm
  run = await launch(dataDir, wvDir);
  report.warm = run.timings;

  // Seed a saved browser session of TABS tabs, then reload so the Browser
  // reads it fresh (an already-mounted Browser would save over it).
  await evaluate(run.cdp, `(() => {
    const tabs = Array.from({ length: ${TABS} }, (_, i) => ({ id: 'probe' + i, title: 'Tab ' + i, url: '${base}/t' + i }));
    localStorage.setItem('dex-browser-session', JSON.stringify({ tabs, activeTab: 'probe0' }));
    return true;
  })()`);
  await evaluate(run.cdp, 'location.reload()', 3000).catch(() => null);
  await sleep(1500);
  for (let i = 0; i < 400; i++) {
    try { if (await evaluate(run.cdp, `!!document.querySelector('[aria-label="Dock"]')`, 2000)) break; } catch { /* reloading */ }
    await sleep(50);
  }

  // Browser restore with TABS saved tabs
  const tB = Date.now();
  const browserOpen = await evaluate(run.cdp, LAUNCH_ONE('browser'), 20000).catch(() => null);
  await sleep(10000); // let restore settle
  const targets = await json('/json/list');
  const restoredTabs = await evaluate(run.cdp, `JSON.parse(localStorage.getItem('dex-browser-session')||'{"tabs":[]}').tabs.length`).catch(() => null);
  report.browser = {
    savedTabs: TABS,
    tabsKeptAfterRestore: restoredTabs,
    openMs: browserOpen,
    livePageTargets: targets.filter((t) => t.url.startsWith(base)).length,
    mountedWebviewHosts: await evaluate(run.cdp, "document.querySelectorAll('[data-native-webview]').length").catch(() => null),
    settleMs: Date.now() - tB,
    ...(await idleCost(run.child.pid, wvDir, 10)),
  };

  // Visit VISIT tabs one after another (a user reading through a session),
  // then count live pages and memory. Tabs are found by their tooltip
  // ("Tab N\n<url>"), which both old and new builds render.
  const VISIT = Math.min(Number(args.visit || 20), TABS);
  let visited = 0;
  for (let i = 1; i <= VISIT; i++) {
    const ok = await evaluate(run.cdp, `(() => {
      const el = Array.from(document.querySelectorAll('[data-app-id="browser"] div[title]')).find(d => d.title.startsWith('Tab ${i}\\n'));
      if (!el) return false; el.click(); return true;
    })()`).catch(() => false);
    if (ok) visited++;
    await sleep(1500); // let the page load
  }
  await sleep(5000);
  const after = await json('/json/list');
  report.browserAfterVisits = {
    visited,
    livePageTargets: after.filter((t) => t.url.startsWith(base)).length,
    mountedWebviewHosts: await evaluate(run.cdp, "document.querySelectorAll('[data-native-webview]').length").catch(() => null),
    ...(await idleCost(run.child.pid, wvDir, 10)),
  };
  run.cdp.close();
  await kill(run.child);
} catch (e) {
  report.error = String(e?.stack || e);
} finally {
  srv.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* WebView2 may still hold files */ }
}

const out = JSON.stringify(report, null, 2);
console.log(out);
if (args.out) { mkdirSync(dirname(args.out), { recursive: true }); writeFileSync(args.out, out + '\n'); }
