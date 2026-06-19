// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Guards the DexScript highlighter against the markup-corruption regression
// (chained regexes re-scanning inserted spans -> garbled `<span class="&lt;span">`).
import { describe, it, expect } from 'vitest';
import { highlightDexScript } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/highlight';

describe('highlightDexScript', () => {
  it('does not corrupt its own span markup', () => {
    const html = highlightDexScript('// Build a mini app in DexScript\nlet x = "hi"');
    expect(html).not.toContain('class="&lt;span');           // the old corruption signature
    expect(html).not.toContain('dex-syn-string">"dex-syn');   // string regex eating class attrs
    expect(html).toContain('<span class="dex-syn-comment">// Build a mini app in DexScript</span>');
  });

  it('treats a keyword INSIDE a comment as comment text, not a keyword span', () => {
    expect(highlightDexScript('// the let keyword')).toBe('<span class="dex-syn-comment">// the let keyword</span>');
  });

  it('classifies keywords, strings, numbers, builtins, and function calls', () => {
    expect(highlightDexScript('let')).toBe('<span class="dex-syn-keyword">let</span>');
    expect(highlightDexScript('"hi"')).toBe('<span class="dex-syn-string">"hi"</span>');
    expect(highlightDexScript('42.5')).toBe('<span class="dex-syn-number">42.5</span>');
    expect(highlightDexScript('print')).toBe('<span class="dex-syn-builtin">print</span>');
    expect(highlightDexScript('foo(')).toContain('<span class="dex-syn-function">foo</span>');
  });

  it('escapes HTML in code (no injection via code content)', () => {
    const html = highlightDexScript('let x = "<img onerror=alert(1)>"');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('consumes a string with escaped quotes as a single token', () => {
    const html = highlightDexScript('"a\\"b"');
    expect((html.match(/dex-syn-string/g) || []).length).toBe(1);
  });
});
