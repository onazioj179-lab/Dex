// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Lightweight ANSI SGR parser -- the ONE canonical source for turning raw shell
// output into styled spans. Handles SGR (color/bold) codes, strips others.
// Shared by the in-app terminal and any other surface that renders PTY output.
// ---------------------------------------------------------------------------
const ANSI_REGEX = /\x1b\[([\d;?]*)([A-Za-z])/g;
const ANSI_COLORS_FG: Record<number, string> = {
  30: '#1e1e1e', 31: '#ff5f5f', 32: '#3da66a', 33: '#ffb020',
  34: '#4a9eff', 35: '#c678dd', 36: '#56b6c2', 37: '#d0d0d0',
  90: '#666666', 91: '#ff8080', 92: '#5dd685', 93: '#ffd166',
  94: '#7ab8ff', 95: '#dd9cff', 96: '#7fdfee', 97: '#ffffff',
};

export interface Span { text: string; color?: string; bold?: boolean; }

export function parseAnsi(input: string, prevColor?: string, prevBold?: boolean): { spans: Span[]; color?: string; bold?: boolean } {
  const spans: Span[] = [];
  let cursor = 0;
  let color = prevColor;
  let bold = prevBold;
  let m: RegExpExecArray | null;
  ANSI_REGEX.lastIndex = 0;
  while ((m = ANSI_REGEX.exec(input)) !== null) {
    if (m.index > cursor) spans.push({ text: input.slice(cursor, m.index), color, bold });
    if (m[2] === 'm') {
      const codes = m[1].split(';').filter(Boolean).map(Number);
      if (codes.length === 0) { color = undefined; bold = false; }
      for (const c of codes) {
        if (c === 0) { color = undefined; bold = false; }
        else if (c === 1) { bold = true; }
        else if (c === 22) { bold = false; }
        else if (c === 39) { color = undefined; }
        else if (ANSI_COLORS_FG[c]) { color = ANSI_COLORS_FG[c]; }
      }
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < input.length) spans.push({ text: input.slice(cursor), color, bold });
  return { spans, color, bold };
}
