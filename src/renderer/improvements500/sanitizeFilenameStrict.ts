// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cross-platform filename sanitizer.
 * Strips reserved characters, control chars, trailing dots/spaces, and Windows
 * reserved device names (CON, PRN, NUL, AUX, COM1-9, LPT1-9).
 */

const RESERVED_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const TRAILING_DOTS_SPACES = /[. ]+$/;

export interface SanitizeFilenameStrictOptions {
  replacement?: string;
  maxLength?: number;
}

export function sanitizeFilenameStrict(input: string, opts: SanitizeFilenameStrictOptions = {}): string {
  const replacement = opts.replacement ?? '_';
  const maxLength = opts.maxLength ?? 255;
  if (typeof input !== 'string') return '';
  let name = input.replace(RESERVED_CHARS, replacement);
  name = name.replace(TRAILING_DOTS_SPACES, '');
  if (RESERVED_NAMES.test(name)) {
    name = `${replacement}${name}`;
  }
  if (name.length === 0) name = 'untitled';
  if (name.length > maxLength) {
    const dot = name.lastIndexOf('.');
    if (dot > 0 && dot > name.length - 16) {
      const ext = name.slice(dot);
      const base = name.slice(0, maxLength - ext.length);
      name = base + ext;
    } else {
      name = name.slice(0, maxLength);
    }
  }
  return name;
}
