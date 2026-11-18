// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { diagnose, jsonDiagnostics, scanStructure, lineColAt } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/diagnostics';

describe('DEX Code diagnostics', () => {
  it('clean code has no problems', () => {
    expect(diagnose('a.js', 'const x = [1, 2, { a: `t ${1 + (2)} s` }];\n// )\n/* ] */\nconst r = /[)\\]]/g;\nfunction f(a) { return a / 2; }\n')).toEqual([]);
    expect(diagnose('a.json', '{"a": [1, 2]}')).toEqual([]);
  });

  it('JSON errors carry the exact line and column', () => {
    const d = jsonDiagnostics('{\n  "a": 1,\n  "b": ,\n}');
    expect(d).toHaveLength(1);
    expect(d[0].line).toBe(3);
  });

  it('an unclosed bracket is reported where it opened', () => {
    const d = scanStructure('function f() {\n  if (x) {\n    go();\n}\n');
    expect(d).toEqual([{ line: 1, col: 14, message: '"{" is never closed', severity: 'error' }]);
  });

  it('a mismatched closer points at itself and names the opener line', () => {
    const d = scanStructure('const a = [1, 2);\n');
    expect(d[0].line).toBe(1);
    expect(d[0].message).toContain('opened at line 1');
  });

  it('unterminated strings, templates and comments', () => {
    expect(scanStructure('const s = "abc;\nx()')[0]).toMatchObject({ line: 1, message: 'String is never closed' });
    expect(scanStructure('const t = `abc')[0].message).toContain('Template literal');
    expect(scanStructure('a();\n/* never')[0]).toMatchObject({ line: 2 });
  });

  it('other syntax errors are reported for the file, never with a guessed line', () => {
    const d = diagnose('a.js', 'const = 5;');
    expect(d).toHaveLength(1);
    expect(d[0].line).toBeNull();
    expect(d[0].message).toMatch(/^Syntax error/);
  });

  it('other file types are not checked (no fake diagnostics)', () => {
    expect(diagnose('notes.md', '(((')).toEqual([]);
    expect(diagnose('a.py', 'def f(:')).toEqual([]);
  });

  it('line/col helper', () => {
    expect(lineColAt('ab\ncd', 4)).toEqual({ line: 2, col: 2 });
  });
});

describe('JSON error locator', () => {
  it('finds common mistakes exactly', async () => {
    const { jsonDiagnostics: j } = await import('../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/diagnostics');
    expect(j('{"a": 1,}')[0]).toMatchObject({ line: 1, message: 'Trailing comma before "}"' });
    expect(j("{'a': 1}")[0].message).toBe('Expected a property name in double quotes');
    expect(j('[1, 2\n 3]')[0]).toMatchObject({ line: 2, message: 'Expected "," or "]"' });
    expect(j('{"a": tru}')[0].message).toBe('Unexpected "t"');
  });
});
