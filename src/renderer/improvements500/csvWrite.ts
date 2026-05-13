// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * RFC 4180 CSV writer. Quotes fields containing the delimiter, quote, CR, or
 * LF, escapes inner quotes by doubling, and prefixes leading
 * `=` / `+` / `-` / `@` to neutralize spreadsheet formula injection.
 */

export interface CsvWriteOptions {
  delimiter?: string;
  newline?: string;
  header?: string[];
  quoteAll?: boolean;
  preventFormulaInjection?: boolean;
}

const DEFAULT_DELIM = ',';
const DEFAULT_NL = '\r\n';
const FORMULA_PREFIXES = new Set(['=', '+', '-', '@']);

export function csvWrite(rows: Array<Record<string, unknown>>, opts: CsvWriteOptions = {}): string {
  const delimiter = opts.delimiter ?? DEFAULT_DELIM;
  const nl = opts.newline ?? DEFAULT_NL;
  const preventFormula = opts.preventFormulaInjection !== false;
  const header = opts.header ?? deriveHeader(rows);
  const lines: string[] = [];
  lines.push(header.map((h) => quoteField(h, delimiter, opts.quoteAll, preventFormula)).join(delimiter));
  for (const row of rows) {
    const cells = header.map((h) => quoteField(stringify(row[h]), delimiter, opts.quoteAll, preventFormula));
    lines.push(cells.join(delimiter));
  }
  return lines.join(nl);
}

function deriveHeader(rows: Array<Record<string, unknown>>): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) set.add(k);
  return Array.from(set);
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
}

function quoteField(value: string, delim: string, quoteAll = false, preventFormula = true): string {
  let s = value;
  if (preventFormula && s.length > 0 && FORMULA_PREFIXES.has(s.charAt(0))) {
    s = `'${s}`;
  }
  const mustQuote = quoteAll || s.includes(delim) || s.includes('"') || s.includes('\n') || s.includes('\r');
  if (!mustQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}
