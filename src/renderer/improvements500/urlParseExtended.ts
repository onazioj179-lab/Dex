// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * URL parser that exposes more structured fields than `new URL()` and supports
 * deterministic re-serialization. Built on top of WHATWG `URL` for correctness.
 */

export interface ParsedUrl {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  query: Record<string, string | string[]>;
  hash: string;
}

export function parseUrlExtended(input: string, base?: string): ParsedUrl {
  const u = base ? new URL(input, base) : new URL(input);
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(Array.from(u.searchParams.keys()))) {
    const all = u.searchParams.getAll(key);
    query[key] = all.length === 1 ? (all[0] ?? '') : all;
  }
  return {
    protocol: u.protocol,
    username: u.username,
    password: u.password,
    hostname: u.hostname,
    port: u.port,
    pathname: u.pathname,
    query,
    hash: u.hash,
  };
}

export function buildUrlExtended(parts: ParsedUrl): string {
  const u = new URL(`${parts.protocol}//${parts.hostname}${parts.pathname || '/'}`);
  if (parts.port) u.port = parts.port;
  if (parts.username) u.username = parts.username;
  if (parts.password) u.password = parts.password;
  for (const [k, v] of Object.entries(parts.query)) {
    if (Array.isArray(v)) {
      for (const item of v) u.searchParams.append(k, item);
    } else {
      u.searchParams.set(k, v);
    }
  }
  if (parts.hash) u.hash = parts.hash;
  return u.toString();
}
