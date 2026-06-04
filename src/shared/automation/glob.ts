// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Glob matching (AUT) — the pattern primitive behind Forge watch-folders,
 * automation file triggers, search file filters, and plugin file permissions.
 * Supports `*` (any run except `/`), `**` (any run incl. `/`), `?` (one char),
 * and `{a,b,c}` brace alternation. Pure: no DOM, no IO.
 */

/** Escape regex metacharacters that are literals in a glob. */
function escapeLiteral(ch: string): string {
  return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/** Compile a glob to an anchored, case-sensitive RegExp. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // ** → match across path separators
        re += '.*';
        i += 2;
        if (glob[i] === '/') i++; // collapse "**/" cleanly
        continue;
      }
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
      } else {
        const alts = glob.slice(i + 1, end).split(',').map((a) => a.split('').map(escapeLiteral).join(''));
        re += `(?:${alts.join('|')})`;
        i = end + 1;
        continue;
      }
    } else {
      re += escapeLiteral(c);
    }
    i++;
  }
  return new RegExp(`^${re}$`);
}

/** True when `path` matches `glob`. */
export function matchGlob(glob: string, path: string): boolean {
  return globToRegExp(glob).test(path);
}

/** True when `path` matches any of the globs. */
export function matchAnyGlob(globs: readonly string[], path: string): boolean {
  return globs.some((g) => matchGlob(g, path));
}

/** Filter a list of paths to those matching the glob. */
export function filterByGlob(glob: string, paths: readonly string[]): string[] {
  const re = globToRegExp(glob);
  return paths.filter((p) => re.test(p));
}
