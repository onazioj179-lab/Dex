// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DexScript syntax highlighter -> HTML safe for innerHTML.
//
// SINGLE-PASS TOKENIZER. The previous implementation chained `String.replace`
// passes over the whole string, so each pass re-scanned the markup the prior
// passes had already inserted -- e.g. the string-literal regex matched the
// quotes inside `class="dex-syn-comment"` and shredded the tag, and the keyword
// regex tokenized words *inside* comments. That rendered visibly corrupt code.
// A left-to-right tokenizer classifies each token once and emits escaped text,
// so inserted spans are never re-scanned. HTML-escaping happens per emitted
// chunk (never on the span markup itself).

const KEYWORDS = new Set([
  'let', 'const', 'fn', 'return', 'if', 'elif', 'else', 'for', 'in', 'while',
  'break', 'continue', 'true', 'false', 'null', 'try', 'catch', 'throw',
]);

const BUILTINS = new Set(['print', 'math', 'time', 'json', 'sys', 'type']);

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function span(cls: string, text: string): string {
  return `<span class="dex-syn-${cls}">${esc(text)}</span>`;
}

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

export function highlightDexScript(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;

  while (i < n) {
    const c = code[i];

    // Line comment — consume to end of line (so keywords/strings inside a
    // comment are NOT separately tokenized).
    if (c === '/' && code[i + 1] === '/') {
      let j = i;
      while (j < n && code[j] !== '\n') j++;
      out += span('comment', code.slice(i, j));
      i = j;
      continue;
    }

    // String literal (single or double quote), honoring backslash escapes.
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n && code[j] !== quote) {
        if (code[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, n); // include the closing quote
      out += span('string', code.slice(i, j));
      i = j;
      continue;
    }

    // Number (integer or decimal).
    if (isDigit(c)) {
      let j = i;
      while (j < n && (isDigit(code[j]) || code[j] === '.')) j++;
      out += span('number', code.slice(i, j));
      i = j;
      continue;
    }

    // Identifier -> keyword / builtin / function (call or definition) / plain.
    if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdentPart(code[j])) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < n && (code[k] === ' ' || code[k] === '\t')) k++;
      const isCall = code[k] === '(';
      if (KEYWORDS.has(word)) out += span('keyword', word);
      else if (BUILTINS.has(word)) out += span('builtin', word);
      else if (isCall) out += span('function', word);
      else out += esc(word);
      i = j;
      continue;
    }

    // Arrow + range operators.
    if (c === '=' && code[i + 1] === '>') { out += span('operator', '=>'); i += 2; continue; }
    if (c === '.' && code[i + 1] === '.') {
      if (code[i + 2] === '.') { out += span('operator', '...'); i += 3; }
      else { out += span('operator', '..'); i += 2; }
      continue;
    }

    // Any other character — emit escaped.
    out += esc(c);
    i++;
  }

  return out;
}
