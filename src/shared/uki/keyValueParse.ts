// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Key-value & frontmatter parsing (note metadata, simple config blocks, LLM
 * structured replies that aren't JSON). Parses "key: value" lines and YAML-ish
 * `---` frontmatter without a full YAML dependency. Pure: no DOM, no IO.
 */

/** Parse "key: value" lines into an object (last value wins; skips blanks/`#`). */
export function parseKeyValues(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) out[key] = value;
  }
  return out;
}

export interface Frontmatter {
  data: Record<string, string>;
  /** The body after the closing `---`. */
  body: string;
}

const FM_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** Split leading `---` frontmatter from the body. No frontmatter → empty data. */
export function parseFrontmatter(text: string): Frontmatter {
  const m = text.match(FM_RE);
  if (!m) return { data: {}, body: text };
  return { data: parseKeyValues(m[1]), body: m[2] };
}
