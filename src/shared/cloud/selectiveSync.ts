// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Selective sync rules.
 *
 * Pick which folders sync. Rules are gitignore-style: includes by default,
 * explicit excludes win, leading "!" re-includes, "**" matches any depth.
 */

// DEX v3.8.9 - selective sync

export interface SelectiveSyncRules {
  patterns: string[];           // each line: "pattern" or "!pattern"
}

function escapeRegex(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern: string): RegExp {
  // Convert gitignore-style glob to a regex.
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      out += '.*';
      i += 2;
    } else if (ch === '*') {
      out += '[^/]*';
      i += 1;
    } else if (ch === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += escapeRegex(ch);
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

/** True if the path should sync. Last-matching rule wins. */
export function shouldSync(path: string, rules: SelectiveSyncRules): boolean {
  let included = true;
  for (const raw of rules.patterns) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const negated = trimmed.startsWith('!');
    const pattern = negated ? trimmed.slice(1) : trimmed;
    if (patternToRegex(pattern).test(path)) included = negated;
  }
  return included;
}

export function defaultSyncRules(): SelectiveSyncRules {
  return {
    patterns: [
      // Sensible defaults: skip caches and build outputs
      'node_modules/**',
      '.cache/**',
      'dist/**',
      'build/**',
      '*.tmp',
      '*.swp',
      '.DS_Store',
      'Thumbs.db',
    ],
  };
}

/** Validate rules; returns the offending lines, if any. */
export function validateRules(rules: SelectiveSyncRules): string[] {
  const errors: string[] = [];
  for (const raw of rules.patterns) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    try { patternToRegex(t.startsWith('!') ? t.slice(1) : t); }
    catch { errors.push(t); }
  }
  return errors;
}
