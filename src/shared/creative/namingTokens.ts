// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Output filename token resolver (CRT-161) — shared by Forge's batch naming and
 * any creative-app export. Resolves `{name}`, `{date}`, `{time}`, `{index}`,
 * `{ext}`, `{width}`, `{height}`, `{preset}` against a context so users can
 * define dynamic output names ("{name}_{preset}_{index}.{ext}"). Unknown tokens
 * are left intact; the result is sanitized for filesystem safety.
 *
 * Pure: no DOM, no IO, injectable clock.
 */

export interface NamingContext {
  name?: string;
  ext?: string;
  index?: number;
  /** Zero-pad width for {index}. Default 3. */
  indexPad?: number;
  width?: number;
  height?: number;
  preset?: string;
  /** Injectable for deterministic tests. */
  now?: Date;
}

// Filesystem-illegal characters only — hyphens and spaces are valid in names.
const ILLEGAL = /[<>:"/\\|?*]/g;

function pad(n: number, width: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, '0');
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

function timeStr(d: Date): string {
  return `${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`;
}

/** Sanitize a single path segment (no separators, no illegal chars). */
export function sanitizeFilename(name: string): string {
  return name.replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'untitled';
}

/** All supported token names (without braces). */
export const NAMING_TOKENS = ['name', 'date', 'time', 'index', 'ext', 'width', 'height', 'preset'] as const;

/**
 * Resolve a naming pattern against a context. The `{ext}` token (and any
 * trailing literal extension) is preserved; the rest of the stem is sanitized.
 */
export function resolveNaming(pattern: string, ctx: NamingContext = {}): string {
  const now = ctx.now ?? new Date();
  const indexPad = ctx.indexPad ?? 3;

  const values: Record<string, string> = {
    name: ctx.name ?? 'output',
    date: dateStr(now),
    time: timeStr(now),
    index: ctx.index !== undefined ? pad(ctx.index, indexPad) : '',
    ext: (ctx.ext ?? '').replace(/^\./, ''),
    width: ctx.width !== undefined ? String(ctx.width) : '',
    height: ctx.height !== undefined ? String(ctx.height) : '',
    preset: ctx.preset ?? '',
  };

  const resolved = pattern.replace(/\{(\w+)\}/g, (whole, token: string) =>
    token in values ? values[token] : whole,
  );

  // Preserve an extension if present (from {ext} or a literal ".ext" tail).
  const dot = resolved.lastIndexOf('.');
  if (dot > 0 && dot < resolved.length - 1) {
    const stem = sanitizeFilename(resolved.slice(0, dot));
    const ext = resolved.slice(dot + 1).replace(ILLEGAL, '');
    return `${stem}.${ext}`;
  }
  return sanitizeFilename(resolved);
}
