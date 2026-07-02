// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Browser — ad/tracker filter engine (pure, unit-tested).
 *
 * A real domain + pattern matcher extracted from the inline Browser.tsx guard,
 * so it can be unit-tested and reused for BOTH top-level navigation blocking
 * and sub-resource filtering. Blocking is ON by default (the owner mandate:
 * "No ads by default").
 *
 * Matching, in order:
 *   1. Per-site allowlist ("shields down" for a first-party host) → never block.
 *   2. Exact host in the blocklist.
 *   3. Any parent domain of the host in the blocklist (ads.doubleclick.net →
 *      doubleclick.net). Uses a true label-boundary suffix match so
 *      "notdoubleclick.net" does NOT match "doubleclick.net".
 *   4. Narrow tracking-path patterns (/beacon, track.php, &_ga=) — deliberately
 *      conservative to avoid breaking legitimate sites.
 */

export type BlockReason = 'domain' | 'pattern';

export interface BlockResult {
  blocked: boolean;
  /** Why it was blocked (absent when not blocked). */
  reason?: BlockReason;
  /** The blocklist entry / pattern that matched (absent when not blocked). */
  matched?: string;
}

/** Narrow, high-precision tracking URL substrings (kept small on purpose). */
export const TRACKING_PATTERNS: readonly string[] = ['/beacon', 'track.php', '&_ga='];

const NOT_BLOCKED: BlockResult = { blocked: false };

function normalizeHost(host: string): string {
  let h = host.toLowerCase().trim();
  if (h.startsWith('www.')) h = h.slice(4);
  // strip a trailing dot (fully-qualified form) and any port
  h = h.replace(/\.$/, '').replace(/:\d+$/, '');
  return h;
}

export class AdblockEngine {
  private blocked: Set<string>;
  /** Blocklist entries that contain a '/', matched as URL substrings. */
  private pathEntries: string[];
  /** First-party hosts the user has turned shields OFF for. */
  private allowlist: Set<string>;

  constructor(blockedDomains: Iterable<string>, allowlist: Iterable<string> = []) {
    this.blocked = new Set();
    this.pathEntries = [];
    for (const raw of blockedDomains) {
      const entry = raw.toLowerCase().trim();
      if (!entry) continue;
      if (entry.includes('/')) this.pathEntries.push(entry);
      else this.blocked.add(normalizeHost(entry));
    }
    this.allowlist = new Set([...allowlist].map(normalizeHost));
  }

  /** Turn blocking off for a first-party host ("shields down"). */
  allowSite(host: string): void { this.allowlist.add(normalizeHost(host)); }
  /** Re-enable blocking for a host. */
  blockSite(host: string): void { this.allowlist.delete(normalizeHost(host)); }
  isSiteAllowed(host: string): boolean { return this.allowlist.has(normalizeHost(host)); }
  getAllowlist(): string[] { return [...this.allowlist]; }

  /** True when a host (or any parent) is in the blocklist. */
  private hostMatches(host: string): string | null {
    const h = normalizeHost(host);
    if (!h) return null;
    if (this.blocked.has(h)) return h;
    // Walk parent domains at label boundaries: a.b.c → b.c → c
    let idx = h.indexOf('.');
    while (idx !== -1 && idx + 1 < h.length) {
      const parent = h.slice(idx + 1);
      if (this.blocked.has(parent)) return parent;
      idx = h.indexOf('.', idx + 1);
    }
    return null;
  }

  /**
   * Decide whether a request URL should be blocked.
   * @param url          The resource/navigation URL.
   * @param firstPartyHost  The page host the request is FOR (allowlist scope).
   * @param usePatterns  Whether to apply tracking-path patterns (tracker mode).
   */
  check(url: string, firstPartyHost?: string, usePatterns = true): BlockResult {
    if (firstPartyHost && this.isSiteAllowed(firstPartyHost)) return NOT_BLOCKED;
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return NOT_BLOCKED; // unparseable — never block (e.g. about:blank, data:)
    }
    const domainHit = this.hostMatches(host);
    if (domainHit) return { blocked: true, reason: 'domain', matched: domainHit };

    // Path-bearing blocklist entries (e.g. "facebook.com/tr") + tracking patterns.
    const lower = url.toLowerCase();
    for (const entry of this.pathEntries) {
      if (lower.includes(entry)) return { blocked: true, reason: 'domain', matched: entry };
    }
    if (usePatterns) {
      for (const p of TRACKING_PATTERNS) {
        if (lower.includes(p)) return { blocked: true, reason: 'pattern', matched: p };
      }
    }
    return NOT_BLOCKED;
  }

  /** Convenience boolean form. */
  isBlocked(url: string, firstPartyHost?: string, usePatterns = true): boolean {
    return this.check(url, firstPartyHost, usePatterns).blocked;
  }

  get size(): number { return this.blocked.size + this.pathEntries.length; }
}
