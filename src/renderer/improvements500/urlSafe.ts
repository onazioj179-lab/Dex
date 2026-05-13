// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Safe URL parsing and validation. Rejects opaque or dangerous schemes
 * (javascript:, data: by default, vbscript:) and provides a normalized
 * representation so callers can confidently render or follow links.
 */

const DANGEROUS_SCHEMES = new Set(['javascript:', 'vbscript:', 'data:', 'file:']);

export interface SafeUrlOptions {
  /** Additional schemes to block. */
  blockSchemes?: ReadonlyArray<string>;
  /** Schemes to allow even if otherwise dangerous (e.g. data: for inline images). */
  allowSchemes?: ReadonlyArray<string>;
}

export interface SafeUrl {
  href: string;
  protocol: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
}

export function parseSafeUrl(input: string, opts: SafeUrlOptions = {}): SafeUrl | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const proto = url.protocol.toLowerCase();
  const allow = new Set((opts.allowSchemes ?? []).map((s) => s.toLowerCase()));
  const block = new Set([...DANGEROUS_SCHEMES, ...(opts.blockSchemes ?? []).map((s) => s.toLowerCase())]);
  if (!allow.has(proto) && block.has(proto)) return null;
  return {
    href: url.href,
    protocol: proto,
    host: url.host,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  };
}

export function isHttpUrl(input: string): boolean {
  const u = parseSafeUrl(input);
  return u !== null && (u.protocol === 'http:' || u.protocol === 'https:');
}
