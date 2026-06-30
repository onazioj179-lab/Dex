// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// PowerRename engine -- pure, dependency-free filename transforms.
//
// Kept separate from the React app so the transform rules are unit-testable and
// can drive a live preview without any file-system access. The app applies the
// computed names through the real `files:rename` IPC; this module only decides
// what each new name should be.

export type CaseTransform = 'none' | 'lower' | 'upper' | 'title' | 'sentence';
export type RenameScope = 'name' | 'extension' | 'full';

export interface NumberingConfig {
  enabled: boolean;
  start: number;
  step: number;
  /** Minimum digit count, zero-padded (e.g. padding 3 -> 007). */
  padding: number;
  position: 'prefix' | 'suffix';
  separator: string;
}

export interface RenameConfig {
  find: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  /** Which part of the filename find/replace applies to. */
  scope: RenameScope;
  caseTransform: CaseTransform;
  prefix: string;
  suffix: string;
  numbering: NumberingConfig;
}

export interface RenameItemResult {
  original: string;
  next: string;
  changed: boolean;
  /** Set when this result is invalid (bad regex, empty, or a collision). */
  error?: string;
}

export const DEFAULT_RENAME_CONFIG: RenameConfig = {
  find: '',
  replace: '',
  useRegex: false,
  caseSensitive: false,
  scope: 'name',
  caseTransform: 'none',
  prefix: '',
  suffix: '',
  numbering: { enabled: false, start: 1, step: 1, padding: 2, position: 'suffix', separator: '-' },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split "archive.tar.gz" -> { base: "archive.tar", ext: "gz" }. A leading dot
 *  (dotfiles like ".gitignore") is treated as part of the base, not an ext. */
function splitExt(filename: string): { base: string; ext: string } {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return { base: filename, ext: '' };
  return { base: filename.slice(0, dot), ext: filename.slice(dot + 1) };
}

function applyCase(text: string, mode: CaseTransform): string {
  switch (mode) {
    case 'lower': return text.toLowerCase();
    case 'upper': return text.toUpperCase();
    case 'title': return text.replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase());
    case 'sentence': {
      const lower = text.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    default: return text;
  }
}

function buildMatcher(cfg: RenameConfig): RegExp | null {
  if (!cfg.find) return null;
  const flags = 'g' + (cfg.caseSensitive ? '' : 'i');
  const pattern = cfg.useRegex ? cfg.find : escapeRegex(cfg.find);
  return new RegExp(pattern, flags);
}

function formatNumber(value: number, padding: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(value).toString();
  return sign + digits.padStart(Math.max(0, padding), '0');
}

/** Compute the new name for a single file. `index` is the file's 0-based
 *  position, used by the numbering sequence. Throws are caught and surfaced as
 *  `error` so an invalid regex degrades to "no change" rather than crashing. */
export function computeRename(original: string, index: number, cfg: RenameConfig, matcher?: RegExp | null): RenameItemResult {
  try {
    const re = matcher !== undefined ? matcher : buildMatcher(cfg);
    let { base, ext } = splitExt(original);

    // 1. find / replace on the selected scope
    if (re) {
      re.lastIndex = 0;
      if (cfg.scope === 'full') {
        const replaced = original.replace(re, cfg.replace);
        ({ base, ext } = splitExt(replaced));
      } else if (cfg.scope === 'extension') {
        ext = ext.replace(re, cfg.replace);
      } else {
        base = base.replace(re, cfg.replace);
      }
    }

    // 2. case transform (name part only)
    base = applyCase(base, cfg.caseTransform);

    // 3. prefix / suffix
    base = `${cfg.prefix}${base}${cfg.suffix}`;

    // 4. numbering sequence
    if (cfg.numbering.enabled) {
      const n = formatNumber(cfg.numbering.start + index * cfg.numbering.step, cfg.numbering.padding);
      const token = `${cfg.numbering.separator}${n}`;
      base = cfg.numbering.position === 'prefix' ? `${n}${cfg.numbering.separator}${base}` : `${base}${token}`;
    }

    const next = ext ? `${base}.${ext}` : base;
    if (!base.trim()) return { original, next: original, changed: false, error: 'Resulting name is empty' };
    return { original, next, changed: next !== original };
  } catch (err) {
    return { original, next: original, changed: false, error: err instanceof Error ? err.message : 'Invalid pattern' };
  }
}

/** Compute new names for a whole batch, flagging collisions (two files mapping
 *  to the same name) and no-ops. Names are compared case-insensitively, matching
 *  Windows/macOS case-insensitive file systems. */
export function computeBatch(originals: string[], cfg: RenameConfig): RenameItemResult[] {
  const matcher = buildMatcher(cfg);
  const results = originals.map((name, i) => computeRename(name, i, cfg, matcher));

  // Collision detection across the produced names + the untouched originals.
  const counts = new Map<string, number>();
  for (const r of results) {
    const key = r.next.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return results.map(r => {
    if (r.error) return r;
    if (r.changed && (counts.get(r.next.toLowerCase()) ?? 0) > 1) {
      return { ...r, error: 'Duplicate name in batch' };
    }
    return r;
  });
}
