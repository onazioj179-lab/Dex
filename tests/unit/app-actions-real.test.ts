// @vitest-environment node
// =============================================================================
// DEX Platform — every advertised app quick action has a real handler
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';

// The registry module reads APP_DEFINITIONS (pure data) — stub the browser bits.
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).window = globalThis;
(globalThis as any).addEventListener = () => {};
(globalThis as any).removeEventListener = () => {};
(globalThis as any).dispatchEvent = () => true;
// tests/setup.ts mocks fs; read the real source files.
const realFs = await vi.importActual<typeof import('fs')>('fs');
const readFileSync = (p: string, enc: 'utf8') => realFs.readFileSync(p, enc);
vi.stubGlobal('navigator', { userAgent: 'node', platform: 'Win32', language: 'en-US' });

describe('registered quick actions are real', () => {
  // Each advertised action id must be handled by the app's registerAppIntentHandler.
  const SOURCES: Record<string, string> = {
    ledger: 'src/renderer/DEXAPPLICATIONS/ledger/Ledger.tsx',
    notes: 'src/renderer/DEXAPPLICATIONS/notes/DexNotes.tsx',
    dexcode: 'src/renderer/DEXAPPLICATIONS/standalone/DexCode.tsx',
    browser: 'src/renderer/pages/Browser.tsx',
  };
  it('every QUICK_ACTIONS entry has a handler in its app', async () => {
    const { QUICK_ACTIONS, getAppEntry } = await import('../../src/renderer/services/appRegistry');
    for (const [appId, actions] of Object.entries(QUICK_ACTIONS)) {
      const file = SOURCES[appId];
      expect(file, `no source mapped for ${appId}`).toBeTruthy();
      const src = readFileSync(resolve(__dirname, '../..', file), 'utf8');
      expect(src).toContain(`registerAppIntentHandler('${appId}'`);
      for (const a of actions) expect(src, `${appId} does not handle ${a.id}`).toContain(`'${a.id}'`);
      expect(getAppEntry(appId)?.actions.length).toBe(actions.length);
    }
  });

  it('app settings targets point at real places', async () => {
    const { getAppEntry } = await import('../../src/renderer/services/appRegistry');
    const { SETTINGS_SECTIONS } = await import('../../src/renderer/shell/settingsSections');
    const sections = new Set(SETTINGS_SECTIONS.map(s => s.id));
    for (const id of ['browser', 'files', 'videoeditor', 'ledger']) {
      const t = getAppEntry(id)?.settings;
      expect(t).toBeTruthy();
      if (t?.kind === 'settings') expect(sections.has(t.section)).toBe(true);
    }
    expect(readFileSync(resolve(__dirname, '../../src/renderer/DEXAPPLICATIONS/ledger/Ledger.tsx'), 'utf8')).toContain("'open-settings'");
  });
});

