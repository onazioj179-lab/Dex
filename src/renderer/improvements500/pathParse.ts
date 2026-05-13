// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Minimal POSIX-style path utilities. Forward-slash separator only;
 * deliberately decoupled from Node's `path` module so it works in browsers.
 */

export function joinPath(...parts: string[]): string {
  const filtered = parts.filter((p) => p && p.length > 0);
  if (filtered.length === 0) return '';
  let joined = filtered.join('/');
  joined = joined.replace(/\/+/g, '/');
  return joined;
}

export function dirname(p: string): string {
  if (!p) return '';
  if (p === '/') return '/';
  const trimmed = p.replace(/\/+$/, '');
  const i = trimmed.lastIndexOf('/');
  if (i === -1) return '';
  if (i === 0) return '/';
  return trimmed.slice(0, i);
}

export function basename(p: string, ext?: string): string {
  if (!p) return '';
  const trimmed = p.replace(/\/+$/, '');
  const i = trimmed.lastIndexOf('/');
  let name = i === -1 ? trimmed : trimmed.slice(i + 1);
  if (ext && name.endsWith(ext) && name !== ext) {
    name = name.slice(0, name.length - ext.length);
  }
  return name;
}

export function extname(p: string): string {
  if (!p) return '';
  const base = basename(p);
  const i = base.lastIndexOf('.');
  if (i <= 0) return '';
  return base.slice(i);
}

export function normalizePath(p: string): string {
  if (!p) return '';
  const isAbs = p.startsWith('/');
  const segments = p.split('/').filter((s) => s.length > 0);
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else if (!isAbs) {
        stack.push('..');
      }
      continue;
    }
    stack.push(seg);
  }
  const joined = stack.join('/');
  return isAbs ? '/' + joined : joined || '.';
}

export function relativePath(from: string, to: string): string {
  const fromSegs = normalizePath(from).split('/').filter((s) => s.length > 0);
  const toSegs = normalizePath(to).split('/').filter((s) => s.length > 0);
  let i = 0;
  while (i < fromSegs.length && i < toSegs.length && fromSegs[i] === toSegs[i]) i += 1;
  const up = new Array(fromSegs.length - i).fill('..');
  return [...up, ...toSegs.slice(i)].join('/') || '.';
}
