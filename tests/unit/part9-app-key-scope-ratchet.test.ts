// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Ratchet: every window/document keydown handler in an app must check that the
// key is meant for that app (apps stay mounted in the background). Handlers that
// only close their own open menu/modal on Escape, or are not mounted, are listed.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/renderer/DEXAPPLICATIONS', 'src/renderer/pages'];
const ALLOWED = new Set([
  'src/renderer/DEXAPPLICATIONS/flux/Flux.tsx:handleEscape',            // closes its own menu
  'src/renderer/DEXAPPLICATIONS/prism/Prism.tsx:onKey',                 // Escape closes its own popover
  'src/renderer/DEXAPPLICATIONS/prism/Prism.tsx:handleEscape',          // closes its own menu
  'src/renderer/DEXAPPLICATIONS/forge/Forge.tsx:handleKey',             // Escape closes its own menu
  'src/renderer/DEXAPPLICATIONS/imosion/Imosion.tsx:resume',            // once: resumes the AudioContext
  'src/renderer/DEXAPPLICATIONS/standalone/KanbanApp.tsx:onKey',        // Escape closes its own dialog
  'src/renderer/pages/settingsPanels/SpatialDesktopPanel.tsx:onKey',    // shortcut capture while recording
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('app keyboard handlers are scoped to their app', () => {
  it('every window/document keydown handler calls keyEventForApp', () => {
    const missing: string[] = [];
    for (const f of ROOTS.flatMap(files)) {
      const src = readFileSync(f, 'utf8');
      const rel = f.replace(/\\/g, '/');
      for (const m of src.matchAll(/(?:window|document)\.addEventListener\('keydown',\s*(\w+)/g)) {
        const name = m[1];
        const at = m.index ?? 0;
        const def = src.lastIndexOf(`const ${name} = (e: KeyboardEvent)`, at);
        const body = def >= 0 ? src.slice(def, def + 400) : '';
        if (body.includes('keyEventForApp(') || ALLOWED.has(`${rel}:${name}`)) continue;
        missing.push(`${rel}:${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
