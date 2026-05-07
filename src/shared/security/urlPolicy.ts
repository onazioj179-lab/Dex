// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * URL allow / deny policy for UKI tools and the in-app browser.
 *
 * Default-deny for sensitive patterns (RFC 1918 IPs, link-local, file://,
 * data:, javascript:). Default-allow for HTTPS public URLs. The user can
 * extend either list from Settings -> Privacy.
 */

// DEX v3.8.9 - URL policy

const PRIVATE_IP_RES = [
  /^https?:\/\/(?:127\.|localhost|0\.0\.0\.0)/i,
  /^https?:\/\/10\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/172\.(?:1[6-9]|2\d|3[01])\./,
  /^https?:\/\/(?:169\.254\.|fe80::)/i,
  /^https?:\/\/\[?::1\]?/i,
];

const ALWAYS_DENY_SCHEME = /^(file|data|javascript|vbscript|chrome|about|view-source|blob):/i;

export interface UrlPolicy {
  allow: string[];        // glob-ish patterns ("*.example.com")
  deny: string[];
  allowPrivateNetwork: boolean;
  allowHttp: boolean;     // disabled by default (HTTPS-only)
}

export function defaultUrlPolicy(): UrlPolicy {
  return { allow: [], deny: [], allowPrivateNetwork: false, allowHttp: false };
}

function matchesPattern(host: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern === '*' || pattern === host) return true;
  if (pattern.startsWith('*.')) {
    const tail = pattern.slice(1);  // ".example.com"
    return host === pattern.slice(2) || host.endsWith(tail);
  }
  return host === pattern;
}

export type UrlVerdict = { allowed: true } | { allowed: false; reason: string };

export function checkUrl(url: string, policy: UrlPolicy): UrlVerdict {
  if (!url) return { allowed: false, reason: 'empty url' };
  if (ALWAYS_DENY_SCHEME.test(url)) return { allowed: false, reason: 'scheme not allowed' };
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { allowed: false, reason: 'malformed url' }; }
  if (parsed.protocol !== 'https:' && !(policy.allowHttp && parsed.protocol === 'http:')) {
    return { allowed: false, reason: 'https required' };
  }
  if (!policy.allowPrivateNetwork && PRIVATE_IP_RES.some((re) => re.test(url))) {
    return { allowed: false, reason: 'private network blocked' };
  }
  const host = parsed.hostname.toLowerCase();
  for (const pat of policy.deny) {
    if (matchesPattern(host, pat)) return { allowed: false, reason: `denied by ${pat}` };
  }
  if (policy.allow.length === 0) return { allowed: true };
  if (policy.allow.some((pat) => matchesPattern(host, pat))) return { allowed: true };
  return { allowed: false, reason: 'not on allow list' };
}
