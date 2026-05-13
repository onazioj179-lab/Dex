// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Command palette registry + fuzzy search (T9-004, T9-010 via category=app).
 */

export interface Command {
  id: string;
  title: string;
  /** Optional grouping label, e.g. "Files", "Window", "App". */
  category?: string;
  /** Optional secondary search text. */
  keywords?: string;
  /** Optional shortcut hint string ("Ctrl+K"). */
  shortcut?: string;
  run: () => void | Promise<void>;
}

const registry = new Map<string, Command>();
type Listener = () => void;
const listeners = new Set<Listener>();

export function registerCommand(cmd: Command): () => void {
  registry.set(cmd.id, cmd);
  for (const l of listeners) l();
  return () => unregisterCommand(cmd.id);
}

export function unregisterCommand(id: string): void {
  if (registry.delete(id)) for (const l of listeners) l();
}

export function listCommands(): Command[] {
  return Array.from(registry.values());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subsequence fuzzy match. Returns score (higher better) or -1 if no match. */
export function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let hi = 0, ni = 0, score = 0, streak = 0;
  while (hi < h.length && ni < n.length) {
    if (h[hi] === n[ni]) {
      streak += 1;
      score += 1 + streak; // reward consecutive matches
      ni += 1;
    } else {
      streak = 0;
    }
    hi += 1;
  }
  if (ni < n.length) return -1;
  // Prefer shorter matches.
  return score - h.length * 0.01;
}

export interface SearchResult { command: Command; score: number; }

export function searchCommands(query: string, commands: readonly Command[] = listCommands()): SearchResult[] {
  if (!query) return commands.map((c) => ({ command: c, score: 0 }));
  const out: SearchResult[] = [];
  for (const c of commands) {
    const text = `${c.title} ${c.category ?? ''} ${c.keywords ?? ''}`;
    const s = fuzzyScore(text, query);
    if (s >= 0) out.push({ command: c, score: s });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Test helper. */
export function _reset(): void { registry.clear(); listeners.clear(); }
