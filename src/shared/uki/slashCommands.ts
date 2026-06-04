// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Slash-command parsing (UKI command box). Recognises "/command arg1 arg2",
 * supports quoted arguments, and matches a typed command against a registry
 * (with a closest-match suggestion for typos). Pure: no DOM, no IO.
 */

export interface ParsedCommand {
  isCommand: boolean;
  command: string;
  args: string[];
  /** The raw argument string after the command. */
  argString: string;
}

/** Split an argument string respecting double-quoted groups. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return out;
}

/** Parse a possible slash command. Non-slash input → isCommand:false. */
export function parseSlashCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { isCommand: false, command: '', args: [], argString: '' };
  }
  const body = trimmed.slice(1);
  const spaceIdx = body.search(/\s/);
  const command = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).toLowerCase();
  const argString = spaceIdx === -1 ? '' : body.slice(spaceIdx + 1).trim();
  return { isCommand: command.length > 0, command, args: splitArgs(argString), argString };
}

/** True when `command` is in the registry (case-insensitive). */
export function isKnownCommand(command: string, registry: readonly string[]): boolean {
  return registry.some((c) => c.toLowerCase() === command.toLowerCase());
}
