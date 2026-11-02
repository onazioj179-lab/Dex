// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Guard: no stylesheet may test the `style` attribute on an ANCESTOR compound
// (e.g. `:root[style*="--x: 1"] *`). Blink keys invalidation on the attribute
// name only, so such a rule makes every inline-style write on ANY element
// recompute that element's whole subtree. Measured in DEX: one spatial-camera
// update with 58 windows open took ~3 s; after removing 7 such rules, ~37 ms.
// Matching an element's OWN style (`[style*="x"]` in the last compound) is fine.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../src/renderer');

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') cssFiles(p, out); }
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

/** Selectors (comma-split, comments stripped) from a stylesheet's rule preludes. */
function selectors(css: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  const re = /([^{}]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments))) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith('@')) continue;
    out.push(...prelude.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

/** True when a `[style` attribute test sits in a compound that is followed by a combinator. */
export function hasAncestorStyleAttr(sel: string): boolean {
  // Split into compound selectors at top-level combinators (whitespace > + ~),
  // ignoring anything inside () or [] (e.g. :not(...), attribute values).
  const compounds: string[] = [];
  let depth = 0, cur = '';
  for (const c of sel.trim()) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (depth === 0 && /[\s>+~]/.test(c)) { if (cur) compounds.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur) compounds.push(cur);
  return compounds.slice(0, -1).some((c) => c.includes('[style'));
}

describe('CSS [style] attribute selectors', () => {
  it('detects the pattern', () => {
    expect(hasAncestorStyleAttr(':root[style*="--dex-motion: off"] *')).toBe(true);
    expect(hasAncestorStyleAttr(':root:not([style*="x"]) .a')).toBe(true);
    expect(hasAncestorStyleAttr('html[style*="font-size: 110"] > p')).toBe(true);
    expect(hasAncestorStyleAttr('.a [style*="overflow"]')).toBe(false);
    expect(hasAncestorStyleAttr('[style*="font-weight: 700"]')).toBe(false);
  });

  it('never appear on an ancestor compound in renderer CSS', () => {
    const offenders: string[] = [];
    for (const f of cssFiles(root)) {
      for (const sel of selectors(fs.readFileSync(f, 'utf8'))) {
        if (hasAncestorStyleAttr(sel)) offenders.push(`${path.relative(root, f)}: ${sel}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
