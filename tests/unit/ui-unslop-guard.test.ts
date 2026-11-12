// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Guards for the UI unslop pass: one keyboard focus ring, no coloured halos
// in shared shadow tokens, no purple "AI" gradients on the touched surfaces.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = join(__dirname, '../../src/renderer');
const read = (p: string) => readFileSync(join(R, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Top-level (not inside @media/@supports) rules whose selector matches. */
function topLevelRules(css: string, test: (sel: string) => boolean): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      const sel = css.slice(start, i).trim();
      if (depth === 0 && !sel.startsWith('@') && test(sel)) out.push(sel);
      depth++; start = i + 1;
    } else if (c === '}') { depth--; start = i + 1; }
    else if (c === ';' && depth === 0) start = i + 1;
  }
  return out;
}

describe('UI unslop guards', () => {
  it('the only unscoped :focus-visible rule is the canonical one in globals.css', () => {
    const generic = (sel: string) => sel.split(',').some((s) => /^\s*(\*|:where\([^)]*\)|button|a|input(\[[^\]]*\])*(:not\([^)]*\))?|select|textarea|\[role="button"\]|\[tabindex\])?:focus-visible\s*$/.test(s));
    expect(topLevelRules(strip(read('styles/design-system.css')), generic)).toEqual([]);
    expect(topLevelRules(strip(read('styles/design-tokens.css')), generic)).toEqual([]);
    expect(topLevelRules(strip(read('styles/globals.css')), (s) => s.trim() === ':focus-visible')).toHaveLength(1);
  });

  it('shared shadow tokens carry no coloured halo, and glow tokens stay <= 4px', () => {
    const css = strip(read('styles/design-system.css'));
    for (const t of ['--shadow-premium-md', '--shadow-premium-lg', '--shadow-premium-xl', '--shadow-dock', '--focus-ring-premium']) {
      const m = new RegExp(`${t}:([^;]+);`).exec(css);
      expect(m, t).not.toBeNull();
      expect(m![1], t).not.toMatch(/0 0 (?:[5-9]|\d{2,})px rgba\(74, 158, 255/);
    }
    for (const m of css.matchAll(/--shadow-glow(?:-accent)?:([^;]+);/g)) {
      for (const blur of m[1].matchAll(/0 0 (\d+)px/g)) expect(Number(blur[1])).toBeLessThanOrEqual(4);
    }
  });

  it('no gradient-text or pulsing-glow utilities come back', () => {
    const css = strip(read('styles/design-system.css'));
    expect(css).not.toMatch(/background-clip:\s*text/);
    expect(css).not.toMatch(/@keyframes dex-glow-pulse|@keyframes dex-breathe/);
  });

  it('touched surfaces use the solid accent, not purple gradients', () => {
    for (const f of ['components/ChatPanel.tsx', 'components/ShareDialog.tsx', 'components/account/ProBadge.tsx', 'DEXAPPLICATIONS/standalone/Learn.tsx']) {
      expect(read(f), f).not.toMatch(/linear-gradient\(135deg,[^)]*(#5e5ce6|#bf5af2|#8B5CF6|#5856d6|#7d7aff)/i);
    }
  });
});
