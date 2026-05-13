// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Public XML / HTML escape helpers. Distinct from the local `escapeHtml`
 * inside `markdownLite.ts` (which keeps that module self-contained). These
 * are exported for general consumer use - prop sanitization, attribute
 * value rendering, etc.
 */

const HTML_RE = /[&<>"']/g;
const HTML_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeXml(input: string): string {
  return input.replace(HTML_RE, (c) => HTML_MAP[c]);
}

export function escapeHtmlAttr(input: string): string {
  return escapeXml(input);
}

const UNESCAPE_RE = /&(amp|lt|gt|quot|#39|apos);/g;
const UNESCAPE_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
};

export function unescapeHtml(input: string): string {
  return input.replace(UNESCAPE_RE, (_, name: string) => UNESCAPE_MAP[name] ?? `&${name};`);
}
