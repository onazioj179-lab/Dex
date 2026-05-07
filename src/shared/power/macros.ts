// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave J v4.0.1 - Power-user macros, snippet engine, fuzzy command palette.

// ---------- Snippet engine ----------

export interface SnippetVariableContext {
  clipboard?: string;
  selection?: string;
  filename?: string;
  date?: Date;
  custom?: Record<string, string>;
}

export interface SnippetExpansion { text: string; cursorOffset: number; placeholders: Array<{ index: number; offset: number; length: number; placeholder: string }> }

const VAR_DATE_FMT: Record<string, (d: Date) => string> = {
  YYYY: d => String(d.getFullYear()),
  MM: d => String(d.getMonth() + 1).padStart(2, '0'),
  DD: d => String(d.getDate()).padStart(2, '0'),
  HH: d => String(d.getHours()).padStart(2, '0'),
  mm: d => String(d.getMinutes()).padStart(2, '0'),
  ss: d => String(d.getSeconds()).padStart(2, '0'),
};

export function expandSnippet(template: string, ctx: SnippetVariableContext = {}): SnippetExpansion {
  const date = ctx.date ?? new Date();
  let text = template
    .replace(/\$CLIPBOARD/g, ctx.clipboard ?? '')
    .replace(/\$SELECTION/g, ctx.selection ?? '')
    .replace(/\$FILENAME/g, ctx.filename ?? '')
    .replace(/\$DATE\(([^)]+)\)/g, (_m, fmt: string) =>
      fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, t => VAR_DATE_FMT[t](date)));
  if (ctx.custom) {
    for (const [k, v] of Object.entries(ctx.custom)) {
      text = text.replace(new RegExp(`\\$\\{${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g'), v);
    }
  }
  // Tabstops: $0 final, $1, $2, ${1:default}
  const placeholders: Array<{ index: number; offset: number; length: number; placeholder: string }> = [];
  let cursorOffset = -1;
  text = text.replace(/\$\{(\d+):([^}]*)\}|\$(\d+)/g, (_match, idx1: string, def: string, idx2: string, offset: number) => {
    const idxStr = idx1 ?? idx2;
    const idx = parseInt(idxStr, 10);
    const placeholder = def ?? '';
    if (idx === 0) cursorOffset = offset;
    placeholders.push({ index: idx, offset, length: placeholder.length, placeholder });
    return placeholder;
  });
  if (cursorOffset === -1) cursorOffset = text.length;
  return { text, cursorOffset, placeholders };
}

// ---------- Keystroke macro recorder/playback ----------

export type MacroEvent =
  | { kind: 'keydown'; key: string; mods: ReadonlyArray<'ctrl' | 'shift' | 'alt' | 'meta'>; atMs: number }
  | { kind: 'keyup'; key: string; atMs: number }
  | { kind: 'text'; value: string; atMs: number }
  | { kind: 'pause'; ms: number; atMs: number };

export interface Macro { id: string; name: string; events: MacroEvent[] }

export function normaliseMacro(events: ReadonlyArray<MacroEvent>): MacroEvent[] {
  if (events.length === 0) return [];
  const start = events[0].atMs;
  return events.map(e => ({ ...e, atMs: e.atMs - start } as MacroEvent));
}

export function macroDurationMs(macro: Macro): number {
  if (macro.events.length === 0) return 0;
  return Math.max(...macro.events.map(e => e.atMs));
}

export function compressMacro(events: ReadonlyArray<MacroEvent>): MacroEvent[] {
  const out: MacroEvent[] = [];
  let textBuf = '';
  let textStart = 0;
  for (const e of events) {
    if (e.kind === 'text') {
      if (textBuf === '') textStart = e.atMs;
      textBuf += e.value;
    } else {
      if (textBuf) { out.push({ kind: 'text', value: textBuf, atMs: textStart }); textBuf = ''; }
      out.push(e);
    }
  }
  if (textBuf) out.push({ kind: 'text', value: textBuf, atMs: textStart });
  return out;
}

// ---------- Fuzzy matcher (command palette) ----------

export interface FuzzyMatch<T> { item: T; score: number; positions: number[] }

export function fuzzyMatch<T>(items: ReadonlyArray<T>, query: string, getText: (item: T) => string, limit: number = 50): FuzzyMatch<T>[] {
  const q = query.trim().toLowerCase();
  if (q === '') return items.slice(0, limit).map(item => ({ item, score: 0, positions: [] }));
  const matches: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const text = getText(item).toLowerCase();
    const result = subseqMatch(text, q);
    if (result) matches.push({ item, score: result.score, positions: result.positions });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

function subseqMatch(text: string, query: string): { score: number; positions: number[] } | null {
  const positions: number[] = [];
  let qi = 0;
  let lastIdx = -1;
  let consec = 0;
  let score = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) {
      positions.push(i);
      score += 10;
      if (lastIdx === i - 1) { consec++; score += consec * 5; } else { consec = 0; }
      if (i === 0 || /[\s_\-./\\]/.test(text[i - 1])) score += 8;
      lastIdx = i;
      qi++;
    }
  }
  if (qi < query.length) return null;
  score -= text.length * 0.1;
  return { score, positions };
}

// ---------- Hotkey conflict detection ----------

export interface HotkeyBinding { id: string; combo: string; scope: string; action: string }

export function normaliseCombo(combo: string): string {
  const parts = combo.toLowerCase().split('+').map(p => p.trim()).filter(Boolean);
  const order = ['ctrl', 'alt', 'shift', 'meta'];
  const mods = parts.filter(p => order.includes(p)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const key = parts.find(p => !order.includes(p)) ?? '';
  return [...mods, key].filter(Boolean).join('+');
}

export interface HotkeyConflict { combo: string; scope: string; bindings: HotkeyBinding[] }

export function detectHotkeyConflicts(bindings: ReadonlyArray<HotkeyBinding>): HotkeyConflict[] {
  const groups = new Map<string, HotkeyBinding[]>();
  for (const b of bindings) {
    const key = `${b.scope}|${normaliseCombo(b.combo)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }
  const conflicts: HotkeyConflict[] = [];
  for (const [key, items] of groups) {
    if (items.length > 1) {
      const [scope, combo] = key.split('|');
      conflicts.push({ combo, scope, bindings: items });
    }
  }
  return conflicts;
}
