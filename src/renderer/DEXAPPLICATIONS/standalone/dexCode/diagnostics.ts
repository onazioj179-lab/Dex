// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX Code diagnostics: real syntax problems, located only when the location is
// known for certain.
//   JSON        the engine's own parse error, converted from its position to line/col
//   JS / DexScript
//               a scanner pinpoints unbalanced ( ) [ ] { }, unterminated strings,
//               template literals and block comments; anything else the JS engine
//               rejects is reported for the file without a line (never guessed).
// No new dependency: this runs in the renderer on the open file only.

import { transpileDexScript } from './runtime';

export interface Diagnostic { line: number | null; col: number | null; message: string; severity: 'error' | 'warning' }

/** 1-based line/col of a 0-based offset. */
export function lineColAt(src: string, offset: number): { line: number; col: number } {
  let line = 1, last = -1;
  for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) { line++; last = i; }
  return { line, col: offset - last };
}

/**
 * Strict JSON (RFC 8259) check returning the offset and reason of the first
 * error. The engine's own message often has no position (newer V8), so this
 * finds it exactly.
 */
export function findJsonError(src: string): { at: number; message: string } | null {
  let i = 0;
  const ws = () => { while (i < src.length && ' \t\n\r'.includes(src[i])) i++; };
  const fail = (message: string): never => { throw { at: i, message }; };
  const value = (): void => {
    ws();
    const c = src[i];
    if (c === '{') {
      i++; ws();
      if (src[i] === '}') { i++; return; }
      for (;;) {
        ws(); if (src[i] !== '"') fail('Expected a property name in double quotes');
        string(); ws();
        if (src[i] !== ':') fail('Expected ":" after the property name');
        i++; value(); ws();
        if (src[i] === ',') { i++; ws(); if (src[i] === '}') fail('Trailing comma before "}"'); continue; }
        if (src[i] === '}') { i++; return; }
        fail('Expected "," or "}"');
      }
    }
    if (c === '[') {
      i++; ws();
      if (src[i] === ']') { i++; return; }
      for (;;) {
        value(); ws();
        if (src[i] === ',') { i++; ws(); if (src[i] === ']') fail('Trailing comma before "]"'); continue; }
        if (src[i] === ']') { i++; return; }
        fail('Expected "," or "]"');
      }
    }
    if (c === '"') { string(); return; }
    const lit = /^(true|false|null|-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?)/.exec(src.slice(i, i + 400));
    if (lit) { i += lit[0].length; return; }
    if (i >= src.length) fail('Unexpected end of the file');
    fail(c === "'" ? 'Strings must use double quotes' : `Unexpected "${c}"`);
  };
  const string = () => {
    i++;
    while (i < src.length && src[i] !== '"') {
      if (src[i] === '\n') fail('String is never closed');
      if (src[i] === '\\') i++;
      i++;
    }
    if (i >= src.length) fail('String is never closed');
    i++;
  };
  try {
    value(); ws();
    if (i < src.length) fail('Unexpected text after the JSON value');
    return null;
  } catch (e) {
    const x = e as { at?: number; message?: string };
    return typeof x.at === 'number' ? { at: x.at, message: String(x.message) } : { at: 0, message: String(e) };
  }
}

export function jsonDiagnostics(src: string): Diagnostic[] {
  if (!src.trim()) return [];
  try { JSON.parse(src); return []; } catch (e) {
    const found = findJsonError(src);
    if (found) return [{ ...lineColAt(src, found.at), message: found.message, severity: 'error' }];
    return [{ line: null, col: null, message: String((e as Error).message || e), severity: 'error' }];
  }
}

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/** Brackets, strings, templates and comments, with exact positions. */
export function scanStructure(src: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const stack: { ch: string; at: number }[] = [];
  const tplDepth: number[] = []; // stack sizes at which a `${` opened inside a template
  let i = 0;
  const n = src.length;
  const err = (at: number, message: string) => { out.push({ ...lineColAt(src, at), message, severity: 'error' }); };
  const prevSignificant = (k: number): string => { for (let j = k - 1; j >= 0; j--) { const c = src[j]; if (!/\s/.test(c)) return c; } return ''; };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) { err(i, 'Comment is never closed (missing */)'); return out; }
      i = end + 2; continue;
    }
    if (c === '"' || c === "'") {
      const start = i; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++; }
      if (i >= n || src[i] === '\n') { err(start, 'String is never closed'); } else i++;
      continue;
    }
    if (c === '`' || (c === '}' && tplDepth.length && tplDepth[tplDepth.length - 1] === stack.length)) {
      // Start of a template, or the end of a ${ } returning into one.
      if (c === '}') tplDepth.pop();
      const start = i; i++;
      let closed = false;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') { i++; closed = true; break; }
        if (src[i] === '$' && src[i + 1] === '{') { i += 2; tplDepth.push(stack.length); closed = true; break; }
        i++;
      }
      if (!closed) { err(start, 'Template literal is never closed (missing `)'); return out; }
      continue;
    }
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prevSignificant(i))) {
      // Regex literal: skip to its closing slash on the same line.
      let j = i + 1, inClass = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j++;
      }
      if (j < n && src[j] === '/') { i = j + 1; continue; }
    }
    if (c === '(' || c === '[' || c === '{') stack.push({ ch: c, at: i });
    else if (c === ')' || c === ']' || c === '}') {
      const top = stack.pop();
      if (!top) err(i, `Unexpected "${c}" (nothing to close)`);
      else if (top.ch !== PAIRS[c]) { err(i, `"${c}" does not match "${top.ch}" opened at line ${lineColAt(src, top.at).line}`); return out; }
    }
    i++;
  }
  for (const s of stack) err(s.at, `"${s.ch}" is never closed`);
  return out;
}

/** The JS engine's verdict for the whole file (no position available from it). */
function engineCheck(js: string): Diagnostic[] {
  try {
    // Parse only, never run. Module syntax is not valid in a Function body,
    // so import/export lines are ignored for this check.
    // eslint-disable-next-line no-new-func
    new Function(js.replace(/^\s*(import|export)\b[^\n]*$/gm, ''));
    return [];
  } catch (e) {
    return [{ line: null, col: null, message: `Syntax error: ${(e as Error).message}`, severity: 'error' }];
  }
}

export function diagnose(fileName: string, src: string): Diagnostic[] {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'json') return jsonDiagnostics(src);
  if (ext === 'dex' || ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'jsx') {
    const structural = scanStructure(src);
    if (structural.length) return structural;
    if (ext === 'jsx') return [];
    let js = src;
    if (ext === 'dex') { try { js = transpileDexScript(src); } catch (e) { return [{ line: null, col: null, message: String((e as Error).message), severity: 'error' }]; } }
    return engineCheck(js);
  }
  return [];
}
