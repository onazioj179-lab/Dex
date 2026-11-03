// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Address-bar input -> what the Browser should load. Pure, so it is tested.
// Only http(s) pages are loaded; script/data/file and other schemes are refused
// (the browser view is a plain web view with no file or privileged access).
//

export type AddressResult =
  | { kind: 'url'; url: string }
  | { kind: 'search'; url: string }
  | { kind: 'blocked'; reason: string };

const LOCAL_HOST = /^(localhost|\[[0-9a-f:]+\]|(?:\d{1,3}\.){3}\d{1,3})(:\d{1,5})?(\/.*)?$/i;
// host.tld[:port][/path] with a letter TLD of 2+ chars (rejects "1.5" or "v2.0 notes").
const DOMAIN = /^([a-z0-9-]+\.)+[a-z][a-z0-9-]{1,62}\.?(:\d{1,5})?([/?#].*)?$/i;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

export function normalizeAddress(input: string, searchPrefix: string): AddressResult {
  const raw = input.trim();
  if (!raw) return { kind: 'blocked', reason: 'Type an address or a search.' };
  const compact = raw.replace(/\s/g, '').toLowerCase();

  const m = SCHEME.exec(compact);
  // "localhost:3000" / "example.com:8080" are host:port, not a scheme.
  const isPort = !!m && /^\d{1,5}([/?#]|$)/.test(compact.slice(m[0].length));
  const scheme = m && !isPort ? m[1] : null;
  if (scheme) {
    if (scheme === 'http' || scheme === 'https') {
      try {
        const u = new URL(raw);
        if (!u.hostname) return { kind: 'blocked', reason: 'That address has no host.' };
        return { kind: 'url', url: u.href };
      } catch {
        return { kind: 'blocked', reason: 'That address is not valid.' };
      }
    }
    if (scheme === 'about' && compact === 'about:blank') return { kind: 'url', url: 'about:blank' };
    return { kind: 'blocked', reason: `DEX Browser does not open ${scheme}: addresses.` };
  }

  if (!/\s/.test(raw)) {
    if (LOCAL_HOST.test(raw)) {
      try { return { kind: 'url', url: new URL(`http://${raw}`).href }; } catch { /* fall through to search */ }
    }
    if (DOMAIN.test(raw)) {
      try { return { kind: 'url', url: new URL(`https://${raw}`).href }; } catch { /* fall through to search */ }
    }
  }
  return { kind: 'search', url: `${searchPrefix}${encodeURIComponent(raw)}` };
}
