// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * TSV parser/writer. Tab-delimited with optional quoted fields and
 * embedded newlines (RFC4180-style escaping with double-quote).
 */

export interface TsvOptions {
  delimiter?: string; // default '\t'
}

export function parseTsv(input: string, opts: TsvOptions = {}): string[][] {
  const delim = opts.delimiter ?? '\t';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field.length === 0) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      if (c === '\r' && input[i] === '\n') i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function writeTsv(rows: readonly (readonly string[])[], opts: TsvOptions = {}): string {
  const delim = opts.delimiter ?? '\t';
  return rows
    .map((row) =>
      row
        .map((f) => {
          if (f.includes(delim) || f.includes('\n') || f.includes('\r') || f.includes('"')) {
            return `"${f.replace(/"/g, '""')}"`;
          }
          return f;
        })
        .join(delim),
    )
    .join('\n');
}
