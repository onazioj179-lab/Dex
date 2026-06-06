// =============================================================================
// DEX Platform — end-to-end verification harness (real node fs)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Exercises the app platform against the real filesystem: manifest validation,
// registry install/list/duplicate-reject/persist/uninstall, and the host-services
// capability gate + path sandbox. Run:  npx tsx scripts/verify-platform.ts
// (The fs-heavy modules can't run under the vite/react vitest pipeline, which
// browser-stubs node:fs — so they are verified here, in real node.)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateManifest } from '../src/main/platform/manifest';
import { AppRegistry } from '../src/main/platform/appRegistry';
import { buildHostServices } from '../src/main/platform/hostServices';

const MAGNIFY = {
  id: 'dex.app.magnify', name: 'Magnify', version: '1.0.0', publisher: 'OJ',
  entry: 'ui/dist/index.html', icon: 'src-tauri/icons/icon.png',
  capabilities: ['fs.read', 'fs.write', 'system.scan'],
};

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

async function main() {
  // ── manifest ──
  ok(validateManifest(MAGNIFY).ok, 'valid Magnify manifest');
  ok(!validateManifest({ ...MAGNIFY, id: 'Magnify' }).ok, 'reject non-namespaced id');
  ok(!validateManifest({ ...MAGNIFY, id: 'dex/app/x' }).ok, 'reject id with separators');
  ok(!validateManifest({ ...MAGNIFY, capabilities: ['fs.read', 'net.all'] }).ok, 'reject unknown capability');
  ok(!validateManifest({ ...MAGNIFY, entry: '../../etc' }).ok, 'reject traversal entry');
  ok(!validateManifest(null).ok, 'reject null');

  // ── registry ──
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-verify-'));
  const reg = new AppRegistry(dir);
  const e = reg.install(MAGNIFY, ['fs.read', 'fs.write', 'system.scan', 'fs.pick']);
  ok(JSON.stringify(e.granted) === JSON.stringify(['fs.read', 'fs.write', 'system.scan']), 'grants clamped to manifest (fs.pick dropped)');
  ok(reg.list().length === 1, 'registry lists the installed app');
  ok(fs.existsSync(e.dataDir), 'data dir created under the bundle');
  try { reg.install(MAGNIFY); ok(false, 'dup'); } catch { ok(true, 'duplicate id rejected'); }
  try { reg.install({ ...MAGNIFY, id: 'bad id' }); ok(false, 'malformed'); } catch { ok(true, 'malformed id rejected'); }
  ok(new AppRegistry(dir).has('dex.app.magnify'), 'registry persists across reopen');

  // ── host services: capability gate + path sandbox ──
  const host = buildHostServices(e, { scan: async () => ({ ok: true }), info: async () => ({ v: 1 }) });
  const file = path.join(e.dataDir, 'note.txt');
  await host.fs.write(file, 'hi');
  ok((await host.fs.read(file)) === 'hi', 'sandbox read/write works');
  try { await host.fs.read(path.join(dir, '..', 'x.txt')); ok(false, 'escape'); }
  catch (er: any) { ok(/sandbox/.test(er.message), 'path escape blocked'); }
  try { await host.fs.listDir(e.dataDir); ok(false, 'ungranted'); }
  catch (er: any) { ok(/not granted/.test(er.message), 'ungranted capability (fs.list) blocked'); }
  ok(JSON.stringify(await host.system.scan()) === JSON.stringify({ ok: true }), 'system.scan delegates to backend');

  // ── uninstall ──
  ok(reg.uninstall('dex.app.magnify') === true && !fs.existsSync(e.installPath), 'uninstall removes the bundle');
  ok(reg.uninstall('dex.app.magnify') === false, 'uninstall of a missing app is a no-op');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\nDEX platform verification: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
