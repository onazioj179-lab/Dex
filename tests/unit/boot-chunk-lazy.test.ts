// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Keeps heavy, rarely-needed code out of the eager boot chunk (dex-app-core).
// The trophy catalog (~330 KB of source) and xterm (~300 KB) were parsed on
// every boot before Home could paint; both now load on demand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('boot chunk stays lean', () => {
  it('AppManager loads engagement with a dynamic import only', () => {
    const src = read('src/renderer/components/AppManager.tsx');
    expect(src).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+'\.\.\/services\/engagement'/m);
    expect(src).toContain("import('../services/engagement')");
  });

  it('the services barrel does not re-export engagement', () => {
    expect(read('src/renderer/services/index.ts')).not.toMatch(/\}\s*from '\.\/engagement'/);
  });

  it('vite pins the trophy modules and xterm out of dex-app-core', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toContain("return 'dex-achievements'");
    expect(cfg).toContain("return 'app-terminal'");
    // The pins must run before the catch-all shared-infra rule.
    expect(cfg.indexOf("return 'dex-achievements'")).toBeLessThan(cfg.indexOf('NotesDocumentModel is a SHARED'));
    expect(cfg.indexOf("return 'app-terminal'")).toBeLessThan(cfg.indexOf("return 'dex-achievements'"));
  });
});
