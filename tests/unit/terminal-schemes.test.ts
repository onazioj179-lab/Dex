// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';

vi.mock('@xterm/xterm', () => ({ Terminal: class {} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));

import { TERMINAL_SCHEMES, schemeTheme } from '../../src/renderer/components/Terminal';
import { parseSettings } from '../../src/renderer/components/terminalProfiles';

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const ANSI = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightBlack'] as const;

describe('Terminal colour schemes', () => {
  for (const [id, sc] of Object.entries(TERMINAL_SCHEMES)) {
    it(`${sc.label}: text and program colours are readable`, () => {
      const t = sc.theme;
      expect(ratio(t.foreground!, t.background!), `${id} text`).toBeGreaterThanOrEqual(7);
      const weak = ANSI.filter((k) => ratio((t as Record<string, string>)[k], t.background!) < 3).map((k) => `${k} ${ratio((t as Record<string, string>)[k], t.background!).toFixed(2)}`);
      expect(weak, id).toEqual([]);
    });
  }

  it('remembers the chosen scheme and falls back safely', () => {
    expect(parseSettings(JSON.stringify({ fontSize: 14, scheme: 'light' })).scheme).toBe('light');
    expect(parseSettings(JSON.stringify({ scheme: 'neon-nonsense' })).scheme).toBe('dex');
    expect(parseSettings(null).scheme).toBe('dex');
    expect(schemeTheme('nope')).toBe(TERMINAL_SCHEMES.dex.theme);
  });
});
