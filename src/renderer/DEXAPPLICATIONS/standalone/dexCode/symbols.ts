// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DexCode -- symbol extraction for the Outline / precision navigation.
 *
 * A pure, dependency-free single-pass scan of source text into a list of
 * jump-to-able symbols: DexScript `fn` functions, classes, and TOP-LEVEL
 * (column-0) `let`/`const`/`var` bindings — top-level only so the outline shows
 * the file's structure, not every local inside a function body. JS-style
 * `function`/`class` are recognised too so pasted JS still outlines.
 *
 * Pure (no DOM/IPC) so it is trivially testable and reusable.
 */

export type CodeSymbolKind = 'function' | 'class' | 'variable';

export interface CodeSymbol {
  name: string;
  kind: CodeSymbolKind;
  /** 1-indexed line where the symbol is declared. */
  line: number;
}

// `fn name(` (DexScript) or `function name(` (JS). Allows leading indent so a
// nested helper still appears.
const RE_FN = /^\s*(?:fn|function)\s+([A-Za-z_$][\w$]*)\s*\(/;
// `class Name`
const RE_CLASS = /^\s*class\s+([A-Za-z_$][\w$]*)/;
// Top-level binding ONLY (no leading whitespace) so function-body locals are skipped.
const RE_TOP_VAR = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=/;

/** Short tag shown in the outline next to each symbol. */
export const SYMBOL_TAG: Record<CodeSymbolKind, string> = {
  function: 'fn',
  class: 'cls',
  variable: 'let',
};

/** Extract jump-to-able symbols from source. Order = appearance in the file. */
export function extractSymbols(code: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  if (!code) return out;
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    if ((m = RE_FN.exec(line))) { out.push({ name: m[1], kind: 'function', line: i + 1 }); continue; }
    if ((m = RE_CLASS.exec(line))) { out.push({ name: m[1], kind: 'class', line: i + 1 }); continue; }
    if ((m = RE_TOP_VAR.exec(line))) { out.push({ name: m[1], kind: 'variable', line: i + 1 }); continue; }
  }
  return out;
}

/** Character offset of the start of a 1-indexed line (clamped). */
export function lineStartOffset(code: string, line: number): number {
  const lines = code.split('\n');
  const target = Math.max(1, Math.min(line, lines.length));
  let pos = 0;
  for (let i = 0; i < target - 1; i++) pos += lines[i].length + 1;
  return pos;
}
