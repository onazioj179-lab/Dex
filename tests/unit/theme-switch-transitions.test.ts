// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Theme switches must not start colour transitions on every element (2.2 s of
// style work per switch with 7 apps open in the packaged app; 125 ms without).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { withoutTransitions, setThemeAttribute, applyTheme } from '../../src/renderer/utils/theme';

describe('theme switch without transitions', () => {
  it('suppresses transitions only while the change is applied', () => {
    let seenDuring = false;
    withoutTransitions(() => {
      seenDuring = !!document.querySelector('style[data-dex-theme-switch]');
    });
    expect(seenDuring).toBe(true);
    expect(document.querySelector('style[data-dex-theme-switch]')).toBeNull();
  });

  it('removes the suppressor even if the change throws', () => {
    expect(() => withoutTransitions(() => { throw new Error('x'); })).toThrow('x');
    expect(document.querySelector('style[data-dex-theme-switch]')).toBeNull();
  });

  it('sets data-theme and classes, and skips a no-op change', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.body.classList.contains('light-mode')).toBe(true);
    setThemeAttribute('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    setThemeAttribute('dark');
    expect(document.querySelectorAll('style[data-dex-theme-switch]')).toHaveLength(0);
  });

  it('every renderer write of data-theme goes through the helper', () => {
    const root = path.resolve(__dirname, '../../src/renderer');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        if (/setAttribute\(\s*['"]data-theme['"]/.test(src)) offenders.push(path.relative(root, p).split(path.sep).join('/'));
      }
    };
    walk(root);
    // utils/theme.ts is the one theme controller; nothing else writes the attribute.
    expect(offenders.sort()).toEqual(['utils/theme.ts']);
  });
});
