// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX Code editing commands, as pure functions over (text, selection).
//
// The editor is a <textarea>, so every smart key (Tab, brackets, quotes,
// Enter, comment toggle, line moves) rewrites the text itself. Doing that
// inline in the key handler had bugs that lost code: Tab or "(" with a
// selection replaced the selection, and "'" inside a word ("don't") doubled.
// Each command here returns the new text and selection, or null to let the
// browser handle the key.

export interface EditResult {
  text: string;
  start: number;
  end: number;
}

export const INDENT = '  ';

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);
const QUOTES = new Set(['"', "'", '`']);

const isWordChar = (c: string | undefined): boolean => !!c && /[A-Za-z0-9_$]/.test(c);

/** Offset of the first character of the line containing `pos`. */
export function lineStart(text: string, pos: number): number {
  return text.lastIndexOf('\n', pos - 1) + 1;
}

/** Offset just past the last character of the line containing `pos` (before its '\n'). */
export function lineEnd(text: string, pos: number): number {
  const i = text.indexOf('\n', pos);
  return i === -1 ? text.length : i;
}

/** The [from, to) range of whole lines touched by a selection. A selection that ends at the
 *  very start of a line does not include that line (as in every code editor). */
function lineRange(text: string, start: number, end: number): { from: number; to: number } {
  const from = lineStart(text, start);
  const lastPos = end > start && text[end - 1] === '\n' ? end - 1 : end;
  return { from, to: lineEnd(text, lastPos) };
}

/** Line comment prefix for a file name. DexScript and C-family use `//`. */
export function commentPrefix(fileName: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (['py', 'sh', 'bash', 'ps1', 'rb', 'yml', 'yaml', 'toml', 'r', 'pl', 'conf', 'ini'].includes(ext)) return '#';
  if (['sql', 'lua', 'hs'].includes(ext)) return '--';
  return '//';
}

/** Tab / Shift+Tab. Without a multi-line selection Tab inserts an indent; with one it indents
 *  every selected line. Shift+Tab always outdents the touched lines. */
export function indent(text: string, start: number, end: number, outdent: boolean): EditResult {
  const multiLine = text.slice(start, end).includes('\n');
  if (!outdent && !multiLine) {
    return { text: text.slice(0, start) + INDENT + text.slice(end), start: start + INDENT.length, end: start + INDENT.length };
  }
  const { from, to } = lineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  let removedBeforeStart = 0;
  let delta = 0;
  const next = lines.map((line, i) => {
    if (outdent) {
      const n = line.startsWith('\t') ? 1 : Math.min(INDENT.length, line.length - line.trimStart().length);
      if (i === 0) removedBeforeStart = Math.min(n, start - from);
      delta -= n;
      return line.slice(n);
    }
    if (!line.length) return line;
    delta += INDENT.length;
    return INDENT + line;
  });
  const out = text.slice(0, from) + next.join('\n') + text.slice(to);
  const firstLineGrew = !outdent && lines[0].length > 0;
  const newStart = outdent ? start - removedBeforeStart : start + (firstLineGrew ? INDENT.length : 0);
  return { text: out, start: Math.max(from, newStart), end: Math.max(from, end + delta) };
}

/** Typing an opening bracket: wrap a selection, otherwise insert the pair. */
export function openBracket(text: string, start: number, end: number, ch: string): EditResult | null {
  const close = PAIRS[ch];
  if (!close) return null;
  if (start !== end) {
    const inner = text.slice(start, end);
    return { text: text.slice(0, start) + ch + inner + close + text.slice(end), start: start + 1, end: end + 1 };
  }
  // Only auto-close where it helps: before whitespace, a closer, punctuation or end of line.
  const after = text[start];
  if (after && !/[\s)\]};,]/.test(after)) return null;
  return { text: text.slice(0, start) + ch + close + text.slice(end), start: start + 1, end: start + 1 };
}

/** Typing a closing bracket right before the same closer steps over it. */
export function closeBracket(text: string, start: number, end: number, ch: string): EditResult | null {
  if (!CLOSERS.has(ch) || start !== end || text[start] !== ch) return null;
  return { text, start: start + 1, end: start + 1 };
}

/** Typing a quote: wrap a selection, step over a matching quote, or insert a pair, but never
 *  inside or right after a word ("don't", it's, foo'). */
export function quote(text: string, start: number, end: number, ch: string): EditResult | null {
  if (!QUOTES.has(ch)) return null;
  if (start !== end) {
    const inner = text.slice(start, end);
    return { text: text.slice(0, start) + ch + inner + ch + text.slice(end), start: start + 1, end: end + 1 };
  }
  if (text[start] === ch) return { text, start: start + 1, end: start + 1 };
  if (isWordChar(text[start - 1]) || isWordChar(text[start])) return null;
  return { text: text.slice(0, start) + ch + ch + text.slice(end), start: start + 1, end: start + 1 };
}

/** Backspace between an empty pair deletes both; in leading whitespace it removes one indent. */
export function backspace(text: string, start: number, end: number): EditResult | null {
  if (start !== end || start === 0) return null;
  const pair = text[start - 1] + (text[start] ?? '');
  if (['()', '[]', '{}', '""', "''", '``'].includes(pair)) {
    return { text: text.slice(0, start - 1) + text.slice(start + 1), start: start - 1, end: start - 1 };
  }
  const ls = lineStart(text, start);
  const lead = text.slice(ls, start);
  if (lead.length >= INDENT.length && /^ +$/.test(lead)) {
    const n = lead.length % INDENT.length || INDENT.length;
    return { text: text.slice(0, start - n) + text.slice(start), start: start - n, end: start - n };
  }
  return null;
}

/** Enter: keep the line's indent, indent one more after an opener (or a trailing ':' in
 *  Python-like files), and split an empty pair onto its own block. */
export function newline(text: string, start: number, end: number, fileName = ''): EditResult {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const line = before.slice(lineStart(text, start));
  const base = line.match(/^[ \t]*/)?.[0] ?? '';
  const prev = line.trimEnd().slice(-1);
  const opens = prev in PAIRS || (prev === ':' && commentPrefix(fileName) === '#');
  const nextCh = after[0];
  if (opens && nextCh && PAIRS[prev] === nextCh) {
    const inner = '\n' + base + INDENT;
    const ins = inner + '\n' + base;
    const caret = start + inner.length;
    return { text: before + ins + after, start: caret, end: caret };
  }
  const ins = '\n' + base + (opens ? INDENT : '');
  const caret = start + ins.length;
  return { text: before + ins + after, start: caret, end: caret };
}

/** Ctrl+/: comment the touched lines, or uncomment them if every non-blank one is commented. */
export function toggleComment(text: string, start: number, end: number, fileName: string): EditResult {
  const prefix = commentPrefix(fileName);
  const { from, to } = lineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const content = lines.filter((l) => l.trim());
  const allCommented = content.length > 0 && content.every((l) => l.trimStart().startsWith(prefix));
  const minIndent = content.reduce((m, l) => Math.min(m, l.length - l.trimStart().length), Infinity);
  const col = Number.isFinite(minIndent) ? minIndent : 0;
  let firstDelta = 0;
  let total = 0;
  const next = lines.map((l, i) => {
    if (!l.trim()) return l;
    if (allCommented) {
      const at = l.indexOf(prefix);
      const n = prefix.length + (l[at + prefix.length] === ' ' ? 1 : 0);
      if (i === 0) firstDelta = -Math.min(n, Math.max(0, start - from - at));
      total -= n;
      return l.slice(0, at) + l.slice(at + n);
    }
    const ins = prefix + ' ';
    if (i === 0 && start - from >= col) firstDelta = ins.length;
    total += ins.length;
    return l.slice(0, col) + ins + l.slice(col);
  });
  const out = text.slice(0, from) + next.join('\n') + text.slice(to);
  return { text: out, start: Math.max(from, start + firstDelta), end: Math.max(from, end + total) };
}

/** Alt+Up / Alt+Down: move the touched lines one line up or down. */
export function moveLines(text: string, start: number, end: number, dir: -1 | 1): EditResult | null {
  const { from, to } = lineRange(text, start, end);
  const block = text.slice(from, to);
  if (dir === -1) {
    if (from === 0) return null;
    const prevStart = lineStart(text, from - 1);
    const prevLine = text.slice(prevStart, from - 1);
    const out = text.slice(0, prevStart) + block + '\n' + prevLine + text.slice(to);
    const shift = prevLine.length + 1;
    return { text: out, start: start - shift, end: end - shift };
  }
  if (to >= text.length) return null;
  const nextEnd = lineEnd(text, to + 1);
  const nextLine = text.slice(to + 1, nextEnd);
  const out = text.slice(0, from) + nextLine + '\n' + block + text.slice(nextEnd);
  const shift = nextLine.length + 1;
  return { text: out, start: start + shift, end: end + shift };
}

/** Shift+Alt+Down: duplicate the touched lines below, selecting the copy. */
export function duplicateLines(text: string, start: number, end: number): EditResult {
  const { from, to } = lineRange(text, start, end);
  const block = text.slice(from, to);
  const out = text.slice(0, to) + '\n' + block + text.slice(to);
  const shift = block.length + 1;
  return { text: out, start: start + shift, end: end + shift };
}

/** Route a keydown to one of the commands above. Returns null when the key is not ours. */
export function editForKey(
  key: { key: string; ctrl: boolean; shift: boolean; alt: boolean },
  text: string,
  start: number,
  end: number,
  fileName: string,
): EditResult | null {
  const { key: k, ctrl, shift, alt } = key;
  if (ctrl && !alt && (k === '/' || k === '?')) return toggleComment(text, start, end, fileName);
  if (alt && !ctrl && (k === 'ArrowUp' || k === 'ArrowDown')) {
    if (shift) return k === 'ArrowDown' ? duplicateLines(text, start, end) : duplicateLinesAbove(text, start, end);
    return moveLines(text, start, end, k === 'ArrowUp' ? -1 : 1);
  }
  if (ctrl || alt) return null;
  if (k === 'Tab') return indent(text, start, end, shift);
  if (k === 'Enter') return shift ? null : newline(text, start, end, fileName);
  if (k === 'Backspace') return backspace(text, start, end);
  if (k in PAIRS) return openBracket(text, start, end, k);
  if (CLOSERS.has(k)) return closeBracket(text, start, end, k);
  if (QUOTES.has(k)) return quote(text, start, end, k);
  return null;
}

/** Shift+Alt+Up: duplicate the touched lines above; the selection stays on the upper copy. */
function duplicateLinesAbove(text: string, start: number, end: number): EditResult {
  const { from, to } = lineRange(text, start, end);
  const block = text.slice(from, to);
  return { text: text.slice(0, from) + block + '\n' + text.slice(from), start, end };
}
