// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Glob-style wildcard matching with `*` (any chars within segment), `?`
 * (single char), and `**` (any chars across segments). Path separator is
 * `/` by default.
 */

export function wildcardMatch(pattern: string, input: string, separator = '/'): boolean {
  const re = compile(pattern, separator);
  return re.test(input);
}

function compile(pattern: string, sep: string): RegExp {
  const sepEsc = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]!;
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
        if (pattern[i + 1] === sep) i += 1; // consume `/` after `**`
      } else {
        out += `[^${sepEsc}]*`;
      }
    } else if (ch === '?') {
      out += `[^${sepEsc}]`;
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  out += '$';
  return new RegExp(out);
}
