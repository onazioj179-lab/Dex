// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Command palette registry + tiny CLI argv parser + public API contract
 * version stamp.
 */

// DEX v3.8.9 - command registry / cli / api

export interface PaletteCommand {
  id: string;
  label: string;
  /** Search keywords used by the fuzzy matcher. */
  keywords?: string[];
  /** Logical group for sectioned palettes. */
  group?: string;
  /** True iff the command is currently invokable. */
  enabled?: boolean;
}

export interface CommandRegistry {
  commands: PaletteCommand[];
}

export function createRegistry(): CommandRegistry { return { commands: [] }; }

export function registerCommand(reg: CommandRegistry, cmd: PaletteCommand): CommandRegistry {
  if (reg.commands.some((c) => c.id === cmd.id)) {
    return { commands: reg.commands.map((c) => c.id === cmd.id ? cmd : c) };
  }
  return { commands: [...reg.commands, cmd] };
}

export function unregisterCommand(reg: CommandRegistry, id: string): CommandRegistry {
  return { commands: reg.commands.filter((c) => c.id !== id) };
}

/**
 * Tiny in-process fuzzy match: matches when every char of `query`
 * appears in order somewhere in haystack. Not as fancy as fzf but
 * predictable and dependency-free.
 */
export function fuzzyMatch(haystack: string, query: string): number {
  if (!query) return 1;
  const h = haystack.toLowerCase();
  const q = query.toLowerCase();
  let i = 0;
  let score = 0;
  let lastIdx = -1;
  for (const ch of q) {
    const found = h.indexOf(ch, i);
    if (found < 0) return 0;
    score += 1;
    if (lastIdx >= 0 && found === lastIdx + 1) score += 1;     // consecutive bonus
    if (found === 0 || h[found - 1] === ' ' || h[found - 1] === '-') score += 1;
    lastIdx = found;
    i = found + 1;
  }
  // Prefer shorter haystacks.
  return score / Math.max(1, h.length / 8);
}

export interface PaletteSearchResult {
  command: PaletteCommand;
  score: number;
}

export function searchCommands(reg: CommandRegistry, query: string, limit: number = 10): PaletteSearchResult[] {
  const trimmed = query.trim();
  const out: PaletteSearchResult[] = [];
  for (const cmd of reg.commands) {
    if (cmd.enabled === false) continue;
    const haystack = [cmd.label, ...(cmd.keywords ?? []), cmd.group ?? ''].join(' ');
    const score = trimmed ? fuzzyMatch(haystack, trimmed) : 1;
    if (score > 0) out.push({ command: cmd, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- CLI argv parser ----------

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

/** parseArgv(['note', '--title', 'Hi', '-v']) => { command:'note', positional:[], flags:{ title:'Hi', v:true } } */
export function parseArgv(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { command: '', positional: [], flags: {} };
  if (argv.length === 0) return out;
  out.command = argv[0];
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      if (eq >= 0) out.flags[tok.slice(2, eq)] = tok.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) { out.flags[tok.slice(2)] = argv[++i]; }
      else { out.flags[tok.slice(2)] = true; }
    } else if (tok.startsWith('-') && tok.length > 1) {
      const key = tok.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) out.flags[key] = argv[++i];
      else out.flags[key] = true;
    } else {
      out.positional.push(tok);
    }
  }
  return out;
}

// ---------- public API contract ----------

export const PUBLIC_API_VERSION = '1';

export interface ApiRequest<P = unknown> {
  apiVersion: string;
  op: string;
  payload: P;
  /** Optional client-supplied request id for idempotency. */
  requestId?: string;
}

export type ApiResponse<R = unknown> =
  | { ok: true; apiVersion: string; result: R }
  | { ok: false; apiVersion: string; error: { code: string; message: string } };
