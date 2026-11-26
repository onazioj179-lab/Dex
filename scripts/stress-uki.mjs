// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// UKI stress run: the renderer suite (tests/stress) at 10x scale, then the
// native chat-store stress test at 5x, with the numbers written to
// docs/reports/perf/uki-stress-<date>.json. Usage: npm run stress:uki
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const day = new Date().toISOString().slice(0, 10);
const out = `docs/reports/perf/uki-stress-${day}.json`;
const env = { ...process.env, DEX_STRESS: process.env.DEX_STRESS || '10', DEX_STRESS_REPORT: out };
const shell = process.platform === 'win32';

const web = spawnSync('npx', ['vitest', 'run', 'tests/stress'], { stdio: 'inherit', env, shell });
const native = spawnSync('cargo', ['test', '--bin', 'dex-tauri', 'stays_fast_with_a_large_history', '--', '--nocapture'], {
  cwd: 'src-tauri', env: { ...env, DEX_STRESS: '5' }, encoding: 'utf8', shell,
});
process.stdout.write(native.stdout || '');
process.stderr.write(native.stderr || '');

const line = /uki_chat stress: (\d+) messages, insert (\d+) ms, load one conversation (\d+) ms, list (\d+) ms, search (\d+) ms/.exec(`${native.stdout}${native.stderr}`);
try {
  const report = JSON.parse(readFileSync(out, 'utf8'));
  if (line) report.nativeChatStore = { messages: +line[1], insertMs: +line[2], loadConversationMs: +line[3], listMs: +line[4], searchMs: +line[5], build: 'debug' };
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(`\nUKI stress report: ${out}`);
} catch {
  console.error('No report was written (the renderer suite did not finish).');
}
process.exit((web.status || 0) || (native.status || 0));
