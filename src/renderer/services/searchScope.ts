// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Search scope parsing (SCH-043) — lets a user narrow the unified search with
 * inline filters: "in:notes meeting", "kind:file budget", "app:prism". Parses
 * the raw box text into the `kinds` filter + residual text the SearchOrchestrator
 * already understands, so scoping needs no new orchestrator surface.
 *
 * Pure: no DOM, no IO.
 */

import type { SearchKind } from '../../shared/search/SearchOrchestrator';

/** Aliases (plural / colloquial) -> canonical SearchKind. */
const KIND_ALIASES: Record<string, SearchKind> = {
  app: 'app', apps: 'app',
  file: 'file', files: 'file',
  folder: 'folder', folders: 'folder',
  command: 'command', commands: 'command', cmd: 'command',
  setting: 'setting', settings: 'setting',
  note: 'note', notes: 'note',
  task: 'task', tasks: 'task',
  memory: 'memory', memories: 'memory',
  asset: 'asset', assets: 'asset',
  action: 'action', actions: 'action', workflow: 'action', workflows: 'action',
  web: 'web',
};

const SCOPE_RE = /\b(in|kind|type|app):([a-z]+)\b/gi;

export interface ParsedScope {
  /** Residual free-text after scope tokens are stripped. */
  text: string;
  /** Distinct kinds requested, or undefined when unscoped. */
  kinds?: SearchKind[];
}

/**
 * Parse scope tokens out of a query. Recognised prefixes: `in:`, `kind:`,
 * `type:`, `app:`. Unknown kind words are ignored (left as plain text only if
 * they weren't a recognised prefix). Returns trimmed residual text + kinds.
 */
export function parseSearchScope(raw: string): ParsedScope {
  const kinds = new Set<SearchKind>();
  let matchedAny = false;

  const stripped = raw.replace(SCOPE_RE, (whole, prefix: string, word: string) => {
    // `app:<name>` scopes to apps but the word is an app *name*, not a kind —
    // keep it as searchable text.
    if (prefix.toLowerCase() === 'app') {
      kinds.add('app');
      matchedAny = true;
      return ` ${word} `;
    }
    const kind = KIND_ALIASES[word.toLowerCase()];
    if (kind) {
      kinds.add(kind);
      matchedAny = true;
      return ' ';
    }
    return whole; // unrecognised kind -> leave the token in the text
  });

  const text = stripped.replace(/\s+/g, ' ').trim();
  return matchedAny && kinds.size > 0
    ? { text, kinds: Array.from(kinds) }
    : { text };
}
