// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Render a 2D array of strings as a fixed-width ASCII table for logs and CLI
 * output. Supports left/right/center alignment per column.
 */

export type Align = 'left' | 'right' | 'center';

export interface AsciiTableOptions {
  header?: string[];
  align?: Align[];
  padding?: number;
}

export function asciiTable(rows: string[][], opts: AsciiTableOptions = {}): string {
  const padding = opts.padding ?? 1;
  const all = opts.header ? [opts.header, ...rows] : rows;
  if (all.length === 0) return '';
  const cols = Math.max(...all.map((r) => r.length));
  const widths: number[] = new Array(cols).fill(0);
  for (const row of all) {
    for (let c = 0; c < cols; c += 1) {
      const cell = row[c] ?? '';
      if (cell.length > (widths[c] ?? 0)) widths[c] = cell.length;
    }
  }
  const align = opts.align ?? new Array(cols).fill('left');
  const sep = `+${widths.map((w) => '-'.repeat(w + padding * 2)).join('+')}+`;
  const renderRow = (row: string[]) => `|${row.map((cell, c) => {
    const w = widths[c] ?? 0;
    const a = align[c] ?? 'left';
    return ' '.repeat(padding) + padCell(cell ?? '', w, a) + ' '.repeat(padding);
  }).join('|')}|`;
  const out: string[] = [sep];
  if (opts.header) {
    out.push(renderRow(opts.header));
    out.push(sep);
    for (const r of rows) out.push(renderRow(r));
  } else {
    for (const r of rows) out.push(renderRow(r));
  }
  out.push(sep);
  return out.join('\n');
}

function padCell(s: string, width: number, align: Align): string {
  const slack = width - s.length;
  if (slack <= 0) return s;
  if (align === 'right') return ' '.repeat(slack) + s;
  if (align === 'center') {
    const left = Math.floor(slack / 2);
    const right = slack - left;
    return ' '.repeat(left) + s + ' '.repeat(right);
  }
  return s + ' '.repeat(slack);
}
