// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Under Tauri the bridge turns any `dex.<ns>.onY(cb)` / `offY(cb)` call into a
// silent no-op (tauriCompat namespaceProxy): the callback never fires. Transfers,
// the auth store and the vault store all listened that way and never got a single
// push. Native pushes arrive only through `dex.on(channel, cb)` / `dex.off`.
// This ratchet keeps the dead style out of renderer code and out of the types.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const renderer = join(root, 'src/renderer');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const NS_EVENT = /\bdex[!?]*(?:\.[A-Za-z]\w*[!?]*)+\.(?:on|off)[A-Z]\w*/;

describe('bridge event subscriptions', () => {
  it('no renderer code subscribes through dex.<ns>.onY()', () => {
    const offenders: string[] = [];
    for (const file of walk(renderer)) {
      if (file.endsWith('tauriCompat.ts')) continue; // documents the rule
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (NS_EVENT.test(code)) offenders.push(`${file.slice(root.length + 1)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the dex types do not advertise namespaced onY/offY helpers', () => {
    const types = readFileSync(join(renderer, 'types/global.d.ts'), 'utf8');
    expect(types).not.toMatch(/^\s+(on|off)[A-Z]\w*\??:/m);
  });

  it('auth and vault stores listen to the native state pushes', () => {
    const auth = readFileSync(join(renderer, 'store/useAuthStore.ts'), 'utf8');
    const vault = readFileSync(join(renderer, 'store/useVaultStore.ts'), 'utf8');
    expect(auth).toContain("'auth:state-changed'");
    expect(vault).toContain("'vault:state-changed'");
    const authRs = readFileSync(join(root, 'src-tauri/src/auth.rs'), 'utf8');
    const mainRs = readFileSync(join(root, 'src-tauri/src/main.rs'), 'utf8');
    expect(authRs).toContain('"auth:state-changed"');
    expect(mainRs).toContain('"vault:state-changed"');
  });

  it('the auth push never overrides the lock state (native always reports unlocked)', () => {
    const auth = readFileSync(join(renderer, 'store/useAuthStore.ts'), 'utf8');
    const handler = auth.slice(auth.indexOf('const onState'), auth.indexOf("dex.on('auth:state-changed'"));
    expect(handler).not.toMatch(/isLocked/);
  });
});
