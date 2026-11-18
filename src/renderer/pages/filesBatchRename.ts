// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Files › Rename… for several items: find/replace, prefix/suffix, numbering and
// case on the name (the extension is kept unless asked). The plan is checked
// before anything changes: invalid Windows names, two items ending with the
// same name, and names that already exist in the folder (case-insensitive,
// as Windows is) are conflicts and are not renamed. Applying is two-phase
// (temporary names first) so swaps like a->b, b->a work, and a failure puts
// already-renamed items back. Pure planning; unit-tested.

export interface RenameRule {
  find?: string;
  replace?: string;
  matchCase?: boolean;
  prefix?: string;
  suffix?: string;
  /** Replace the whole name with this base (then numbering keeps names apart). */
  base?: string;
  numbering?: { start: number; pad: number; sep: string } | null;
  caseMode?: 'keep' | 'lower' | 'upper' | 'title';
  includeExtension?: boolean;
}

export interface RenameStep { from: string; to: string; changed: boolean; conflict: string | null }

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

export function invalidName(n: string): string | null {
  if (!n.trim()) return 'empty name';
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(n)) return 'contains \\ / : * ? " < > |';
  if (/[. ]$/.test(n)) return 'ends with a dot or space';
  if (RESERVED.test(n)) return 'reserved by Windows';
  if (n.length > 255) return 'longer than 255 characters';
  return null;
}

function splitExt(name: string, isDir: boolean): [string, string] {
  if (isDir) return [name, ''];
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function planBatchRename(
  items: { name: string; isDirectory: boolean }[],
  rule: RenameRule,
  existingNames: string[],
): RenameStep[] {
  const width = Math.max(rule.numbering?.pad ?? 0, String((rule.numbering?.start ?? 1) + items.length - 1).length);
  const steps: RenameStep[] = items.map((it, i) => {
    let [stem, ext] = rule.includeExtension ? [it.name, ''] : splitExt(it.name, it.isDirectory);
    if (rule.base != null && rule.base !== '') stem = rule.base;
    if (rule.find) stem = stem.replace(new RegExp(escapeRe(rule.find), rule.matchCase ? 'g' : 'gi'), rule.replace ?? '');
    if (rule.caseMode === 'lower') stem = stem.toLowerCase();
    else if (rule.caseMode === 'upper') stem = stem.toUpperCase();
    else if (rule.caseMode === 'title') stem = stem.toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
    stem = `${rule.prefix ?? ''}${stem}${rule.suffix ?? ''}`;
    if (rule.numbering) stem = `${stem}${rule.numbering.sep}${String(rule.numbering.start + i).padStart(width, '0')}`;
    const to = stem + ext;
    return { from: it.name, to, changed: to !== it.name, conflict: invalidName(to) };
  });
  // Conflicts: duplicates in the plan, or an existing item that is not itself being renamed away.
  const renamedAway = new Set(steps.filter((s) => s.changed).map((s) => s.from.toLowerCase()));
  const existing = new Set(existingNames.map((n) => n.toLowerCase()).filter((n) => !renamedAway.has(n)));
  const counts = new Map<string, number>();
  for (const s of steps) counts.set(s.to.toLowerCase(), (counts.get(s.to.toLowerCase()) ?? 0) + 1);
  for (const s of steps) {
    if (s.conflict || !s.changed) continue;
    const k = s.to.toLowerCase();
    if ((counts.get(k) ?? 0) > 1) s.conflict = 'two items would get this name';
    else if (existing.has(k) && k !== s.from.toLowerCase()) s.conflict = 'an item with this name already exists';
  }
  return steps;
}

export type RenameFn = (path: string, newName: string) => Promise<void>;

export interface RenameOutcome { renamed: number; skipped: number; failed: string | null; reverted: boolean }

/** Apply the non-conflicting steps in `dir` (two-phase, reverts on failure). */
export async function applyBatchRename(dir: string, steps: RenameStep[], rename: RenameFn): Promise<RenameOutcome> {
  const sep = dir.includes('/') && !dir.includes('\\') ? '/' : '\\';
  const join = (n: string) => `${dir.replace(/[\\/]+$/, '')}${sep}${n}`;
  const todo = steps.filter((s) => s.changed && !s.conflict);
  const tag = `.dexren-${Date.now().toString(36)}`;
  const temps: { step: RenameStep; temp: string }[] = [];
  const done: RenameStep[] = [];
  try {
    for (const [i, s] of todo.entries()) {
      const temp = `${s.from}${tag}-${i}`;
      await rename(join(s.from), temp);
      temps.push({ step: s, temp });
    }
    for (const t of temps) {
      await rename(join(t.temp), t.step.to);
      done.push(t.step);
    }
    return { renamed: done.length, skipped: steps.filter((s) => s.changed && s.conflict).length, failed: null, reverted: false };
  } catch (e) {
    // Put everything back: finished items from their new name, the rest from the temp name.
    for (const s of done) { try { await rename(join(s.to), `${s.from}${tag}-back`); } catch { /* reported below */ } }
    for (const t of temps) {
      const at = done.includes(t.step) ? `${t.step.from}${tag}-back` : t.temp;
      try { await rename(join(at), t.step.from); } catch { /* leave it named at; reported */ }
    }
    return { renamed: 0, skipped: steps.filter((s) => s.changed && s.conflict).length, failed: (e as Error)?.message || 'rename failed', reverted: true };
  }
}
