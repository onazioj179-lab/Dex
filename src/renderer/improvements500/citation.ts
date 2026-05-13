// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Inline citation parser. Extracts numeric citation markers like [1], [12],
 * [^foo] (footnote-style), or [@key] (cite-key) from prose, returning the
 * cleaned text plus offsets of each citation occurrence.
 */

export type CitationKind = 'numeric' | 'footnote' | 'citekey';

export interface Citation {
  kind: CitationKind;
  /** The token inside the brackets, e.g. "1", "foo", "key". */
  ref: string;
  /** Original character index in the source string. */
  start: number;
  /** End index (exclusive). */
  end: number;
}

const PATTERN = /\[(\^[A-Za-z0-9_-]+|@[A-Za-z0-9_-]+|\d+)\]/g;

export function parseCitations(src: string): Citation[] {
  const out: Citation[] = [];
  let m: RegExpExecArray | null;
  PATTERN.lastIndex = 0;
  while ((m = PATTERN.exec(src)) !== null) {
    const raw = m[1];
    let kind: CitationKind = 'numeric';
    let ref = raw;
    if (raw.startsWith('^')) {
      kind = 'footnote';
      ref = raw.slice(1);
    } else if (raw.startsWith('@')) {
      kind = 'citekey';
      ref = raw.slice(1);
    }
    out.push({ kind, ref, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function stripCitations(src: string): string {
  return src.replace(PATTERN, '');
}

export function uniqueRefs(citations: readonly Citation[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of citations) {
    const key = `${c.kind}:${c.ref}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c.ref);
    }
  }
  return out;
}
