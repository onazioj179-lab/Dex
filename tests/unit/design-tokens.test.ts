// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fontStack, motion, hairline, focusRing } from '../../src/renderer/styles/tokens';

const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles/design-tokens.css'), 'utf-8');

// Real emoji / dingbats (NOT arrows — arrows are legit UI glyphs).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

describe('DEX design tokens (UI patch)', () => {
  it('uses the native system font stack for chrome (no web-font-only)', () => {
    expect(css).toContain('--dex-font-ui');
    expect(css).toMatch(/-apple-system/);
    expect(css).toMatch(/Segoe UI Variable/);
    expect(fontStack.ui).toMatch(/-apple-system/);
  });

  it('defines OS-feel motion: 150–220ms, standard ease, no bounce', () => {
    expect(css).toContain('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(css).toMatch(/--dex-motion:\s*180ms/);
    // no spring/overshoot easing in the canonical motion tokens
    expect(motion.base).toBe('180ms cubic-bezier(0.4, 0, 0.2, 1)');
    expect(motion.base).not.toMatch(/1\.\d{2,}/); // no >1 overshoot control point
  });

  it('defines hairline borders, a focus ring, and the fixed icon-size set', () => {
    expect(css).toContain('--dex-hairline');
    expect(css).toContain('--dex-focus-ring');
    expect(css).toMatch(/--dex-icon-sm:\s*16px/);
    expect(css).toMatch(/--dex-icon-md:\s*20px/);
    expect(css).toMatch(/--dex-icon-lg:\s*24px/);
    expect(hairline.default).toContain('1px solid');
    expect(focusRing).toContain('#4a9eff');
  });

  it('provides tabular numerals + shell primitives', () => {
    expect(css).toContain('font-variant-numeric: tabular-nums');
    expect(css).toMatch(/\.dex-titlebar/);
    expect(css).toMatch(/\.dex-sidebar/);
    expect(css).toMatch(/\.dex-panel/);
  });

  it('contains no emoji in the canonical token file', () => {
    expect(EMOJI.test(css)).toBe(false);
  });

  it('applies the tokens to the full system (global layer, zero-specificity)', () => {
    // app-root font → system stack everywhere
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[^}]*--dex-font-ui/);
    // keyboard focus ring app-wide via :where (never overrides components)
    expect(css).toContain(':where(button, [role="button"], a, input, select, textarea, summary, [tabindex]):focus-visible');
    // motion cascade on interactive elements
    expect(css).toMatch(/:where\(button[^)]*\)\s*\{\s*transition/);
  });
});
