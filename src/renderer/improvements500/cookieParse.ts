// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * RFC 6265 Cookie header parsing and Set-Cookie helpers (renderer-safe, no DOM access).
 */

export type CookieMap = Record<string, string>;

export function parseCookies(header: string): CookieMap {
  const out: CookieMap = {};
  if (typeof header !== 'string' || header.length === 0) return out;
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    if (part.length === 0) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      out[part.trim()] = '';
      continue;
    }
    const name = part.slice(0, eq).trim();
    if (name.length === 0) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export interface SerializeCookieOptions {
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

const VALID_NAME = /^[!#-+\--:<-[\]-~]+$/;

export function serializeCookie(name: string, value: string, opts: SerializeCookieOptions = {}): string {
  if (!VALID_NAME.test(name)) {
    throw new Error(`Invalid cookie name: ${name}`);
  }
  const segments: string[] = [`${name}=${encodeURIComponent(value)}`];
  if (opts.domain) segments.push(`Domain=${opts.domain}`);
  if (opts.path) segments.push(`Path=${opts.path}`);
  if (typeof opts.maxAge === 'number' && Number.isFinite(opts.maxAge)) {
    segments.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  }
  if (opts.expires instanceof Date) segments.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly) segments.push('HttpOnly');
  if (opts.secure) segments.push('Secure');
  if (opts.sameSite) segments.push(`SameSite=${opts.sameSite}`);
  return segments.join('; ');
}
