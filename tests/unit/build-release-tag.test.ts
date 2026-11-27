// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { expect, it } from 'vitest';

it('writes a build-tag manifest with the packaged version and the correct asset URL', () => {
  const root = mkdtempSync(join(tmpdir(), 'dex-manifest-'));
  const script = resolve('scripts/write-update-manifest.mjs');
  try {
    mkdirSync(join(root, 'src-tauri'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '7.0.3', dexBuild: '001y' }));
    writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '7.0.3' }));
    writeFileSync(join(root, 'release-notes.md'), 'Bug fixes and improvements');
    writeFileSync(join(root, 'assets/DEX_7.0.3_x64-setup.exe'), 'test fixture');
    const signature = Buffer.from('trusted comment: fixture\tversion:7.0.3').toString('base64');
    writeFileSync(join(root, 'assets/DEX_7.0.3_x64-setup.exe.sig'), signature);
    const run = (tag: string) => execFileSync(process.execPath,
      [script, tag, 'onazioj179-lab/Dex', 'assets'], { cwd: root, stdio: 'pipe' });
    run('v7.0.3(001y)');
    const manifest = JSON.parse(readFileSync(join(root, 'assets/latest.json'), 'utf8'));
    expect(manifest.version).toBe('7.0.3');
    expect(manifest.platforms['windows-x86_64'].url).toContain('/v7.0.3(001y)/');
    expect(manifest.platforms['windows-x86_64'].signature).toBe(signature);
    expect(() => run('v7.0.3(002a)')).toThrow();
    expect(() => run('v7.0.4(001y)')).toThrow();
    run('v7.0.3');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
