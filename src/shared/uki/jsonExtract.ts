// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * JSON extraction from model text (UKI tool-calling / structured output). LLMs
 * often wrap JSON in prose or ```json fences; this finds the first balanced
 * object/array (quote- and escape-aware) and parses it safely. Pure: no DOM, no IO.
 */

/** Locate and parse the first balanced {...} or [...] in `text`. Null on miss. */
export function extractJson<T = unknown>(text: string): T | null {
  const start = firstStructuralIndex(text);
  if (start === -1) return null;

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try { return JSON.parse(slice) as T; } catch { return null; }
      }
    }
  }
  return null;
}

/** Index of the first '{' or '[' that begins a JSON value, or -1. */
function firstStructuralIndex(text: string): number {
  const obj = text.indexOf('{');
  const arr = text.indexOf('[');
  if (obj === -1) return arr;
  if (arr === -1) return obj;
  return Math.min(obj, arr);
}

/** True when `text` contains a parseable JSON object/array. */
export function hasJson(text: string): boolean {
  return extractJson(text) !== null;
}
