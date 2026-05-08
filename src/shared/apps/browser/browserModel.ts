// =============================================================================
// DEX Platform — Track G1: Browser tab/profile model
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Pure model for browser tabs, profiles, and downloads. Real BrowserView
 * mounting + WebRequest + extension host are wired in main; this owns
 * the navigation rules so they're testable.
 */

export interface BrowserProfile {
  id: string;
  name: string;
  /** Stored isolated in vault. */
  vaultBucket: string;
  /** Whether to allow third-party cookies. */
  thirdPartyCookies: boolean;
  /** DNS-over-HTTPS endpoint or null for system. */
  doh?: string | null;
  /** Tracking-protection level. */
  tracking: 'standard' | 'strict' | 'private';
  /** Default search engine. */
  searchEngine: 'duckduckgo' | 'startpage' | 'google' | 'bing' | 'kagi';
}

export interface Tab {
  id: string;
  profileId: string;
  url: string;
  title: string;
  /** Discardable in low-memory situations. */
  pinned: boolean;
  /** Last interaction ms. */
  lastActiveMs: number;
  /** True if currently rendering. */
  loaded: boolean;
}

export type NavigationVerdict =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-scheme' | 'unsafe' | 'blocked-by-profile' };

const ALLOWED_SCHEMES = new Set(['https:', 'http:', 'about:', 'dex:', 'file:']);

export function classifyUrl(input: string, profile: BrowserProfile): NavigationVerdict {
  let u: URL;
  try { u = new URL(input); } catch { return { ok: false, reason: 'invalid-scheme' }; }
  if (!ALLOWED_SCHEMES.has(u.protocol)) return { ok: false, reason: 'invalid-scheme' };
  if (profile.tracking === 'private' && u.protocol === 'http:') return { ok: false, reason: 'unsafe' };
  if (profile.tracking === 'strict' && /(?:^|\.)doubleclick\.net$/.test(u.hostname)) {
    return { ok: false, reason: 'blocked-by-profile' };
  }
  return { ok: true, url: u.toString() };
}

/** Pick which tabs to discard when memory pressure rises. Pinned + active are protected. */
export function pickTabsToDiscard(tabs: ReadonlyArray<Tab>, now: number, idleMs: number, count: number): string[] {
  const candidates = tabs
    .filter(t => !t.pinned && t.loaded && now - t.lastActiveMs > idleMs)
    .sort((a, b) => a.lastActiveMs - b.lastActiveMs);
  return candidates.slice(0, count).map(t => t.id);
}

export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  bytesTotal: number;
  bytesDone: number;
  state: 'queued' | 'active' | 'paused' | 'done' | 'error' | 'cancelled';
  startedAtMs: number;
  /** SHA-256 once complete. */
  sha256?: string;
}

export function downloadEta(item: DownloadItem, now: number): number | null {
  if (item.state !== 'active' || item.bytesDone <= 0 || item.bytesTotal <= 0) return null;
  const elapsedSec = Math.max(0.001, (now - item.startedAtMs) / 1000);
  const rate = item.bytesDone / elapsedSec; // bytes/sec
  const remaining = item.bytesTotal - item.bytesDone;
  return Math.round(remaining / Math.max(1, rate));
}
