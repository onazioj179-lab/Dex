// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Guards for the UI unslop pass: one keyboard focus ring, no coloured halos
// in shared shadow tokens, no purple "AI" gradients on the touched surfaces.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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

  it('pass 2: chrome fills are flat (icon fallbacks, splash, buttons, tints, offline clip)', () => {
    // Wallpapers and LUT/filter thumbnails are content and may keep gradients.
    for (const f of [
      'pages/Home.tsx', 'pages/Settings.tsx', 'services/ScreenGuardSystem.ts', 'components/ShareDialog.tsx',
      'DEXAPPLICATIONS/imosion/Imosion.tsx', 'DEXAPPLICATIONS/prism/Prism.tsx', 'DEXAPPLICATIONS/vinx/Viewer.tsx',
    ]) {
      // keyframe steps (`0% { background: … }`) are the live wallpapers
      const src = read(f).replace(/^\s*\d+% \{ background:.*$/gm, '');
      expect(src, f).not.toMatch(/linear-gradient\(135deg/);
    }
  });

  // Pass 3 (inner apps). Accent is for the primary action and the selected
  // state; hover is neutral and flat; keyboard focus is the one global ring.
  describe('pass 3: app style blocks', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []);
    const apps = [...walk(join(R, 'DEXAPPLICATIONS')), ...walk(join(R, 'pages'))]
      .map((f) => ({ f: f.slice(R.length + 1).replace(/\\/g, '/'), src: readFileSync(f, 'utf8') }));
    const hits = (re: RegExp) => apps.flatMap(({ f, src }) =>
      [...src.matchAll(re)].map((m) => `${f}: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`));

    it('hover never lifts, grows or spins a control', () => {
      expect(hits(/:hover[^{}`]*\{[^}]*(translate[XY]\(-?[1-9]|scale\(1\.[0-9]|rotate\()[^}]*\}/g)).toEqual([]);
    });

    it('hover is not accent-tinted (filled primary buttons excepted)', () => {
      const found = hits(/[^\s{}`,]*:hover[^{}`]*\{[^}]*(--color-accent(?!-fill)|--prism-accent)[^}]*\}/g)
        .filter((h) => !/btn-primary/.test(h));
      expect(found).toEqual([]);
    });

    it('apps do not paint their own accent focus ring', () => {
      expect(hits(/:focus(-visible|-within)?[^{}`]*\{[^}]*(--color-accent|rgba\(74, ?158, ?255|rgba\(10, ?132, ?255)[^}]*\}/g)).toEqual([]);
    });

    it('shared CSS adds no accent halo to focused inputs', () => {
      const halo = /(?:^|\n)\s*(?:input:focus|:where\(input, textarea, select\):focus-visible|\.property-input:focus)[^{]*\{[^}]*box-shadow:\s*0 0 0/;
      expect(strip(read('styles/globals.css'))).not.toMatch(halo);
      expect(strip(read('styles/design-system.css'))).not.toMatch(halo);
    });

    it('shared CSS hover adds no big shadow bloom (blur >= 10px)', () => {
      for (const file of ['styles/design-system.css', 'styles/globals.css']) {
        const css = strip(read(file));
        const bad = [...css.matchAll(/([^{}]*:hover[^{}]*)\{([^{}]*)\}/g)]
          .filter(([, , body]) => { const b = /box-shadow:\s*([^;]*)/.exec(body); return !!b && [...b[1].matchAll(/(-?\d+)px\s+(\d+)px(\s+-?\d+px)?\s+(rgba|#|var|color-mix|hsl)/g)].some((x) => Number(x[2]) >= 10); })
          .map(([, sel]) => `${file}: ${sel.trim().replace(/\s+/g, ' ').slice(0, 80)}`);
        expect(bad).toEqual([]);
      }
    });

    it('no glow wider than 4px on app chrome', () => {
      const glow = /(?:box-shadow|boxShadow|drop-shadow)[^;\n]*?\b0 0 (\d+)px (?!rgba\(0, ?0, ?0)/g;
      const wide = apps.flatMap(({ f, src }) => [...src.matchAll(glow)]
        .filter((m) => Number(m[1]) > 4).map((m) => `${f}: ${m[0].slice(0, 100)}`));
      expect(wide).toEqual([]);
    });

    // Pass 4. Apps stay mounted while others are open, so a bare `button`,
    // `*`, `select` or scrollbar rule in one app's <style> restyles them all.
    it('pass 4: app style blocks do not leak element selectors onto other apps', () => {
      const leaks: string[] = [];
      for (const { f, src } of apps) {
        for (const m of src.matchAll(/<style[^>]*>\{`([\s\S]*?)`\}<\/style>/g)) {
          const css = strip(m[1]).replace(/\$\{[^{}]*\}/g, 'X');
          let depth = 0, start = 0, kf = -1, print = -1;
          for (let i = 0; i < css.length; i++) {
            const c = css[i];
            if (c === '{') {
              const sel = css.slice(start, i).trim();
              if (sel.startsWith('@')) {
                if (/^@(-webkit-)?keyframes/.test(sel)) kf = depth;
                if (/^@media\s+print/.test(sel)) print = depth;
              } else if (kf < 0 && print < 0) {
                for (const part of sel.split(/,(?![^(]*\))/)) {
                  const p = part.trim();
                  if (p && !/[.#]|\[data-|\[class|\[aria-|\[role|:root|:host|:where\(\./.test(p)) leaks.push(`${f}: ${p.slice(0, 60)}`);
                }
              }
              depth++; start = i + 1;
            } else if (c === '}') {
              depth--; if (kf === depth) kf = -1; if (print === depth) print = -1; start = i + 1;
            } else if (c === ';') start = i + 1;
          }
        }
      }
      expect(leaks).toEqual([]);
    });

    it('pass 4: hover is not tinted with a per-app accent constant', () => {
      const found = hits(/[^\s{}`,]*:hover[^{}`]*\{[^}]*?\$\{\w*(ACCENT|Tint)\w*[^}]*\}[^}]*\}/g)
        .filter((h) => !/btn-primary/.test(h));
      expect(found).toEqual([]);
    });
  });

  // Pass 5. The shell layer (shell/, services/, utils/, components/, styles/*.ts)
  // writes CSS from script too; passes 1-4 only looked at apps and .css files.
  describe('pass 5: shell layer CSS-in-JS', () => {
    const skip = new Set(['DEXAPPLICATIONS', 'pages']);
    const walk = (d: string, top = false): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (top && skip.has(e.name) ? [] : walk(join(d, e.name))) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []);
    const shell = walk(R, true).map((f) => ({ f: f.slice(R.length + 1).replace(/\\/g, '/'), src: readFileSync(f, 'utf8') }));
    const hits = (re: RegExp, keep: (m: RegExpMatchArray) => boolean = () => true) => shell.flatMap(({ f, src }) =>
      [...src.matchAll(re)].filter(keep).map((m) => `${f}: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`));

    it('hover never lifts, grows or spins', () => {
      expect(hits(/[^\s{}`,]*:hover[^{}`]*\{[^}]*(translate[XY]?\(-?[1-9]|scale\(1\.[0-9]|rotate\()[^}]*\}/g)).toEqual([]);
    });

    it('no accent focus ring besides the canonical one', () => {
      expect(hits(/[^\s{}`,]*:focus(-visible|-within)?[^{}`]*\{[^}]*(--color-accent|#0a84ff|#4a9eff|rgba\(74, ?158, ?255|rgba\(10, ?132, ?255)[^}]*\}/gi)).toEqual([]);
    });

    it('hover is not accent-tinted', () => {
      expect(hits(/[^\s{}`,]*:hover[^{}`]*\{[^}]*(--color-accent(?!-fill)|rgba\(10, ?132, ?255|rgba\(74, ?158, ?255)[^}]*\}/g)).toEqual([]);
    });

    it('no glow wider than 4px', () => {
      expect(hits(/(?:box-shadow|boxShadow|drop-shadow)[^;\n]*?\b0 0 (\d+)px (?!rgba\(0, ?0, ?0)/g, (m) => Number(m[1]) > 4)).toEqual([]);
    });

    it('the unused VisualEffects stylesheet injector stays gone', () => {
      expect(shell.some(({ f }) => f === 'shell/VisualEffects.ts')).toBe(false);
    });
  });

  describe('pass 4: shared CSS', () => {
    const shared = ['styles/design-system.css', 'styles/globals.css'].map((f) => ({ f, css: strip(read(f)) }));

    it('no shared hover rule lifts, grows or spins', () => {
      const moved = shared.flatMap(({ f, css }) =>
        [...css.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)]
          .filter((m) => /transform:\s*[^;]*(translate|scale|rotate)/.test(m[2]))
          .map((m) => `${f}: ${m[1].trim().replace(/\s+/g, ' ').slice(0, 80)}`));
      expect(moved).toEqual([]);
    });

    it('the retired lift / glow utilities stay gone', () => {
      for (const { f, css } of shared) {
        expect(css, f).not.toMatch(/\.(dex-hover-lift|hover-lift|hover-scale|dex-hover-glow|dex-magnetic|dex-btn-premium|dex-dock-magnify|dex-accent-glow)\b/);
        expect(css, f).not.toMatch(/\[data-hover-lift\]/);
      }
    });

    it('sliders take the canonical focus ring: no halo on the thumb', () => {
      for (const { f, css } of shared) {
        expect(css, f).not.toMatch(/input\[type="range"\]:focus-visible::(-webkit-slider|-moz-range)-thumb/);
      }
    });

    it('shared menu-item hover is neutral, not accent', () => {
      const m = /:where\(\[role="menuitem"\]\):hover\s*\{([^}]*)\}/.exec(shared[1].css);
      expect(m).not.toBeNull();
      expect(m![1]).not.toMatch(/--color-accent/);
    });
  });
});
