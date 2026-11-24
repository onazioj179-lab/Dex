// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Performance tiers may remove expensive effects (blur, animation), but must
// never ADD decoration. A mid-tier rule once forced a heavy box-shadow onto
// every element whose inline style mentioned box-shadow (even `none`), turning
// every tile, row and panel into a floating card on mid-tier machines.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const STYLES = path.resolve(__dirname, '../../src/renderer/styles');

function tierRules(): Array<{ file: string; selector: string; body: string }> {
  const out: Array<{ file: string; selector: string; body: string }> = [];
  for (const f of fs.readdirSync(STYLES).filter((n) => n.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(STYLES, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/data-perf-tier/.test(m[1])) out.push({ file: f, selector: m[1].trim(), body: m[2] });
    }
  }
  return out;
}

describe('performance-tier CSS', () => {
  it('never forces a visible shadow', () => {
    const offenders = tierRules()
      .filter((r) => /box-shadow\s*:\s*(?!none)[^;]*!important/.test(r.body))
      .map((r) => `${r.file}: ${r.selector}`);
    expect(offenders).toEqual([]);
  });

  it('never matches inline styles that merely mention box-shadow', () => {
    const offenders = tierRules().filter((r) => /\[style\*=["']box-shadow/.test(r.selector)).map((r) => `${r.file}: ${r.selector}`);
    expect(offenders).toEqual([]);
  });
});

describe('mid-tier motion', () => {
  it('is scaled by the motion tokens, not forced on every element', () => {
    const offenders = tierRules()
      .filter((r) => /data-perf-tier="mid"/.test(r.selector) && /\*/.test(r.selector) && /(transition|animation)-duration[^;]*!important/.test(r.body))
      .map((r) => `${r.file}: ${r.selector}`);
    expect(offenders).toEqual([]);
  });
});
