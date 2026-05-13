// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Quote-aware CSV parser for Files imports + Tasks bulk-add.
 *
 * RFC 4180 subset: commas, double-quote escaping (""), CR/LF newlines,
 * configurable delimiter, optional header row.
 */

export interface CsvParseOptions {
  delimiter?: string;
  /** When true, returns array of objects keyed by the first row. */
  headers?: boolean;
}

export function parseCsv(input: string, opts: CsvParseOptions = {}): string[][] {
  const delim = opts.delimiter ?? ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\r') { /* skip; handled by \n */ }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  // Trailing field/row (no terminating newline).
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export function parseCsvObjects(input: string, opts: Omit<CsvParseOptions, 'headers'> = {}): Record<string, string>[] {
  const rows = parseCsv(input, opts);
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body.map((r) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i] ?? '';
    return obj;
  });
}
