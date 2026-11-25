// =============================================================================
// DEX Platform — DEX Ledger UI standard (pill controls, rounded cards, no glow)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEDGER_CSS } from '../../src/renderer/DEXAPPLICATIONS/ledger/ledgerUi';

const dir = join(__dirname, '../../src/renderer/DEXAPPLICATIONS/ledger');
const sources = [
  ...readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => join(dir, f)),
  ...readdirSync(join(dir, 'views')).map(f => join(dir, 'views', f)),
].map(p => ({ p, s: readFileSync(p, 'utf8') }));

function rule(selector: string): string {
  const i = LEDGER_CSS.indexOf(`${selector} {`);
  expect(i, `${selector} rule exists`).toBeGreaterThanOrEqual(0);
  return LEDGER_CSS.slice(i, LEDGER_CSS.indexOf('}', i));
}

describe('ledger UI standard', () => {
  it('fields, chips and icon buttons are pills; cards are 14-18px', () => {
    for (const sel of ['.lg-input', '.lg-icon-btn', '.lg-tag', '.lg-nav-row', '.lg-btn']) {
      expect(rule(sel)).toContain('border-radius: 9999px');
    }
    for (const sel of ['.lg-panel', '.lg-summary']) expect(rule(sel)).toContain('border-radius: 14px');
    expect(rule('.lg-modal')).toContain('border-radius: 18px');
  });

  it('fields show no focus glow', () => {
    expect(LEDGER_CSS).toMatch(/\.lg-input:focus, \.lg-input:focus-visible \{ outline: none !important;[^}]*box-shadow: none/);
  });

  it('uses the shared controls instead of hand-built ones', () => {
    expect(LEDGER_CSS).not.toContain('.lg-segment');
    const all = sources.map(x => x.s).join('\n');
    expect(all).not.toContain('className="lg-segment"');
    expect(all).not.toMatch(/<input[^>]*type="search"/);
    expect(all).toContain('DexSearchInput');
    expect(all).toContain('SegmentedControl');
  });

  it('has no letter or glyph placeholders standing in for icons', () => {
    for (const { p, s } of sources) {
      expect(s, p).not.toMatch(/>\+<\/button>/);
      expect(s, p).not.toContain('■');
      expect(s, p).not.toMatch(/status === 'cleared' \? 'C'/);
    }
  });
});
