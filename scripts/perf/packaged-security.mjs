#!/usr/bin/env node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Packaged-build security checks (Windows), on an ISOLATED profile:
//   onboarding gate, tamper resistance, UKI terminal broker boundaries,
//   secret scrubbing, cancel/timeout, browser-tab isolation, background downloads.
//
// Usage: node scripts/perf/packaged-security.mjs --exe <dex-tauri.exe> [--out file.json]
// Every check reports pass/fail with the observed value. Nothing is assumed.

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import http from 'node:http';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => { if (v.startsWith('--')) a.push([v.slice(2), all[i + 1]]); return a; }, []));
const EXE = args.exe;
const PORT = 9600 + Math.floor(Math.random() * 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, observed) => { results.push({ name, pass: !!pass, observed }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(observed).slice(0, 220)}`); };

const prof = mkdtempSync(join(tmpdir(), 'dex-sec-'));
const dataDir = join(prof, 'data'); const wvDir = join(prof, 'wv2'); const work = join(prof, 'work');
mkdirSync(dataDir); mkdirSync(wvDir); mkdirSync(work);

// A local file to download (3 MB) and a page for the tab-isolation check.
const PAYLOAD = Buffer.alloc(3 * 1024 * 1024, 7);
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/file')) { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': PAYLOAD.length }); res.end(PAYLOAD); return; }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>isolation</title><h1>page</h1>');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;

let child;
async function launch() {
  child = spawn(EXE, [], { env: { ...process.env, DEX_DATA_DIR: dataDir, WEBVIEW2_USER_DATA_FOLDER: wvDir, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`, DEX_SECTEST_API_TOKEN: 'LEAKED-SECRET-VALUE' }, stdio: 'ignore' });
  let main;
  for (let i = 0; i < 800 && !main; i++) { try { main = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page' && !t.url.startsWith(base)); } catch {} await sleep(50); }
  return connect(main.webSocketDebuggerUrl);
}
function connect(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url); let id = 0; const pend = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); pend.get(d.id)?.(d); };
    ws.onopen = () => resolve({
      ev: (e) => new Promise((r) => { const i = ++id; pend.set(i, (d) => r(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, awaitPromise: true, returnByValue: true } })); }),
      close: () => ws.close(),
    });
  });
}
const kill = async () => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} await sleep(1500); };
const inv = (cdp, ch, ...a) => cdp.ev(`window.dex.invoke(${JSON.stringify(ch)}, ...${JSON.stringify(a)}).catch(e => ({ thrown: String(e) }))`);

try {
  let cdp = await launch();
  for (let i = 0; i < 300; i++) { if (await cdp.ev(`!!(window.dex && window.dex.invoke)`)) break; await sleep(50); }

  // 1. Fresh profile: nothing decided, protected channels refused natively.
  const st = await inv(cdp, 'onboarding:status');
  check('fresh profile: onboarding not started', st?.status === 'not-started' && st?.requiredDone === false, st?.status);
  const dtp = await inv(cdp, 'dtp:startDiscovery');
  check('fresh profile: DDrop discovery refused (onboarding-required)', dtp?.error === 'onboarding-required', dtp);
  const term0 = await inv(cdp, 'ukiterm:run', { command: 'echo hi', cwd: work });
  check('fresh profile: UKI command refused (onboarding-required)', term0?.error === 'onboarding-required', term0);
  const comp = await inv(cdp, 'onboarding:complete');
  check('complete refused without the required decision', comp?.ok === false, comp);

  // 2. Tampered file is not trusted (written while DEX is closed).
  cdp.close(); await kill();
  writeFileSync(join(dataDir, 'onboarding.json'), JSON.stringify({ flowVersion: 1, termsVersion: 0, privacyVersion: 0, acceptedAt: 1, declined: false, preferencesDone: true }));
  cdp = await launch();
  for (let i = 0; i < 300; i++) { if (await cdp.ev(`!!(window.dex && window.dex.invoke)`)) break; await sleep(50); }
  const st2 = await inv(cdp, 'onboarding:status');
  check('tampered onboarding.json (claims done, no documents accepted) is not trusted', st2?.requiredDone === false && st2?.status === 'not-started', st2?.status);

  // 3. Accept with stale versions refused; with current versions unlocks.
  const bad = await inv(cdp, 'onboarding:accept', { terms: 0, privacy: 0 });
  check('accepting stale document versions is refused', bad?.ok === false, bad?.error);
  const good = await inv(cdp, 'onboarding:accept', { terms: st2.current.terms, privacy: st2.current.privacy });
  check('accepting the current versions records the decision', good?.requiredDone === true, good?.status);

  // 4. Broker boundaries.
  const priv = await inv(cdp, 'ukiterm:run', { command: 'Set-ExecutionPolicy Unrestricted -Scope CurrentUser', cwd: work });
  check('privileged command refused', priv?.ok === false && priv?.risk === 'privileged', priv?.error);
  const elev = await inv(cdp, 'ukiterm:run', { command: 'Start-Process powershell -Verb RunAs', cwd: work });
  check('elevation (-Verb RunAs) refused', elev?.ok === false && elev?.risk === 'privileged', elev?.error);
  const sysdir = await inv(cdp, 'ukiterm:run', { command: 'Get-ChildItem', cwd: 'C:\\Windows' });
  check('Windows folder refused as working folder', sysdir?.ok === false, sysdir?.error);
  const rel = await inv(cdp, 'ukiterm:run', { command: 'Get-ChildItem', cwd: 'relative' });
  check('relative working folder refused', rel?.ok === false, rel?.error);

  const run = await inv(cdp, 'ukiterm:run', { command: 'Write-Output "DEX_UKI_OK"; Write-Output ("secret=" + $env:DEX_SECTEST_API_TOKEN); Write-Output ("task=" + $env:DEX_UKI_TASK)', cwd: work, label: 'sectest' });
  let task;
  for (let i = 0; i < 60; i++) { await sleep(250); task = (await inv(cdp, 'ukiterm:get', run?.id))?.task; if (task && task.status !== 'running') break; }
  check('approved command runs and its output is captured', task?.status === 'completed' && /DEX_UKI_OK/.test(task?.output ?? ''), { status: task?.status, exit: task?.exitCode });
  check('secret-looking environment variables are not passed to the command', !/LEAKED-SECRET-VALUE/.test(task?.output ?? '') && /secret=\s*$/m.test(task?.output ?? ''), (task?.output ?? '').trim().split(/\r?\n/));
  check('task runs marked DEX_UKI_TASK=1', /task=1/.test(task?.output ?? ''), null);

  const long = await inv(cdp, 'ukiterm:run', { command: 'Start-Sleep -Seconds 60', cwd: work });
  await sleep(1500);
  const can = await inv(cdp, 'ukiterm:cancel', long?.id);
  let lt; for (let i = 0; i < 40; i++) { await sleep(250); lt = (await inv(cdp, 'ukiterm:get', long?.id))?.task; if (lt && lt.status !== 'running') break; }
  check('cancel stops a running command', can?.ok && lt?.status === 'cancelled', lt?.status);

  const tmo = await inv(cdp, 'ukiterm:run', { command: 'Start-Sleep -Seconds 60', cwd: work, timeoutSec: 5 });
  let tt; for (let i = 0; i < 60; i++) { await sleep(250); tt = (await inv(cdp, 'ukiterm:get', tmo?.id))?.task; if (tt && tt.status !== 'running') break; }
  check('timeout stops a command that runs too long', tt?.status === 'timed-out', tt?.status);

  const list = await inv(cdp, 'ukiterm:list');
  check('history lists the tasks', (list?.tasks?.length ?? 0) >= 3, list?.tasks?.length);

  // 5. A web page in a Browser tab has no DEX bridge.
  await cdp.ev(`localStorage.setItem('dex-browser-session', JSON.stringify({ tabs: [{ id: 'sec1', title: 'iso', url: '${base}/page' }], activeTab: 'sec1' })); true`);
  await cdp.ev(`window.__dexRunningApps.getState().launchApp({ id: 'browser', name: 'Browser', icon: 'browser' }); true`);
  let pageTarget;
  for (let i = 0; i < 100 && !pageTarget; i++) { await sleep(150); try { pageTarget = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.url.startsWith(base)); } catch {} }
  if (pageTarget) {
    const pg = await connect(pageTarget.webSocketDebuggerUrl);
    const exposed = await pg.ev(`JSON.stringify({ tauri: typeof window.__TAURI_INTERNALS__, dex: typeof window.dex, ipc: typeof window.ipc })`);
    const tryIpc = await pg.ev(`(async () => { try { const r = await window.__TAURI_INTERNALS__.invoke('dex_ipc', { channel: 'onboarding:status', args: [] }); return 'answered:' + JSON.stringify(r).slice(0, 60); } catch (e) { return 'refused:' + String(e).slice(0, 80); } })()`);
    pg.close();
    check('web page in a Browser tab cannot reach DEX native IPC', !/answered/.test(String(tryIpc)), { exposed, tryIpc });
  } else {
    check('web page in a Browser tab cannot reach DEX native IPC', false, 'tab page never appeared (not tested)');
  }

  // 6. Background download: progress events, completion, real file.
  await cdp.ev(`window.__dlEvents = []; window.dex.on && window.dex.on('download:progress', (p) => window.__dlEvents.push(p)); true`);
  const dl = await inv(cdp, 'download:start', `${base}/file/dex-sectest-${Date.now()}.bin`, 'dl_sectest_1');
  let evs = [];
  for (let i = 0; i < 80; i++) { await sleep(250); evs = await cdp.ev('window.__dlEvents'); if (evs?.some((e) => e.state !== 'progressing')) break; }
  const done = evs?.find((e) => e.state === 'completed');
  check('download starts in the background and returns at once', dl?.started === true, dl);
  check('download reports progress and completes with the full size', !!done && done.size === PAYLOAD.length, { events: evs?.length, final: done && { size: done.size, fileName: done.fileName } });
  if (done?.path && existsSync(done.path) && /dex-sectest-/.test(done.path)) { rmSync(done.path); check('test download removed again', !existsSync(done.path), done.fileName); }

  cdp.close();
} catch (e) {
  check('security run completed without a crash', false, String(e?.stack || e).slice(0, 300));
} finally {
  await kill();
  srv.close();
  try { rmSync(prof, { recursive: true, force: true }); } catch {}
}

const summary = { at: new Date().toISOString(), exe: EXE, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results };
console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
if (args.out) { mkdirSync(dirname(args.out), { recursive: true }); writeFileSync(args.out, JSON.stringify(summary, null, 2) + '\n'); }
