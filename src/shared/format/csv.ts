// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CSV parse / stringify (Tasks & Files import/export). RFC-4180-ish: quoted
 * fields may contain the delimiter, quotes (escaped by doubling), and newlines.
 * Pure: no DOM, no IO.
 */

/** Parse CSV text into a 2D array of string cells. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  // Normalize CRLF/CR to LF outside quotes is handled inline below.

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; } // swallow CR (CRLF -> LF)
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }

  // Flush the final field/row (unless the text ended with a trailing newline
  // that already pushed an empty row).
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Quote a single field if it needs it. */
function quoteField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialize rows to CSV text (LF line endings). */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>, delimiter = ','): string {
  return rows
    .map((row) => row.map((cell) => quoteField(String(cell), delimiter)).join(delimiter))
    .join('\n');
}
