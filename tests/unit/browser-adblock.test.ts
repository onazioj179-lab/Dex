// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for the DEX browser ad/tracker filter engine (adblockEngine):
 * exact + parent-domain matching at label boundaries, path entries, tracking
 * patterns, www/port/FQDN normalization, per-site allowlist, and safety
 * against unparseable URLs.
 */
import { describe, it, expect } from 'vitest';
import { AdblockEngine } from '../../src/renderer/DEXAPPLICATIONS/browser/adblockEngine';
import { BLOCKED_DOMAIN_LIST } from '../../src/renderer/config/blocked-domains';

const list = ['doubleclick.net', 'googlesyndication.com', 'facebook.com/tr', 'scorecardresearch.com'];

describe('AdblockEngine — domain matching', () => {
  const eng = new AdblockEngine(list);

  it('blocks an exact blocklisted domain', () => {
    const r = eng.check('https://doubleclick.net/ad');
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('domain');
    expect(r.matched).toBe('doubleclick.net');
  });

  it('blocks subdomains via parent match', () => {
    expect(eng.isBlocked('https://ads.g.doubleclick.net/x.js')).toBe(true);
    expect(eng.isBlocked('https://pagead2.googlesyndication.com/pagead/js/ads.js')).toBe(true);
  });

  it('does NOT match a look-alike suffix (label boundary)', () => {
    expect(eng.isBlocked('https://notdoubleclick.net/')).toBe(false);
    expect(eng.isBlocked('https://mydoubleclick.net.evil.com/')).toBe(false); // .evil.com not listed
  });

  it('normalizes www, trailing dot, and port', () => {
    expect(eng.isBlocked('https://www.doubleclick.net/')).toBe(true);
    expect(eng.isBlocked('https://doubleclick.net.:8080/')).toBe(true);
  });

  it('leaves unrelated first-party sites alone', () => {
    expect(eng.isBlocked('https://en.wikipedia.org/wiki/Ad')).toBe(false);
    expect(eng.isBlocked('https://github.com/anthropics')).toBe(false);
  });
});

describe('AdblockEngine — path entries & patterns', () => {
  const eng = new AdblockEngine(list);

  it('blocks path-bearing blocklist entries as substrings', () => {
    expect(eng.isBlocked('https://www.facebook.com/tr?id=123')).toBe(true);
    // facebook.com itself (login) is NOT blocked — only the /tr pixel
    expect(eng.isBlocked('https://www.facebook.com/login')).toBe(false);
  });

  it('blocks narrow tracking patterns when enabled', () => {
    expect(eng.isBlocked('https://cdn.example.com/beacon?u=1')).toBe(true);
    expect(eng.check('https://x.example.com/beacon').reason).toBe('pattern');
    expect(eng.isBlocked('https://site.example.com/track.php')).toBe(true);
  });

  it('skips tracking patterns when usePatterns=false', () => {
    expect(eng.isBlocked('https://cdn.example.com/beacon', undefined, false)).toBe(false);
    // domain matches still apply with patterns off
    expect(eng.isBlocked('https://doubleclick.net/beacon', undefined, false)).toBe(true);
  });

  it('does not false-positive on legit paths', () => {
    expect(eng.isBlocked('https://news.example.com/tracking-the-news')).toBe(false);
    expect(eng.isBlocked('https://example.com/collect-underpants')).toBe(false);
  });
});

describe('AdblockEngine — allowlist (shields down)', () => {
  it('never blocks when the first-party host is allowlisted', () => {
    const eng = new AdblockEngine(list, ['news.example.com']);
    expect(eng.isBlocked('https://doubleclick.net/ad', 'news.example.com')).toBe(false);
    // but still blocks for other sites
    expect(eng.isBlocked('https://doubleclick.net/ad', 'other.example.com')).toBe(true);
  });

  it('allowSite / blockSite toggle at runtime', () => {
    const eng = new AdblockEngine(list);
    expect(eng.isBlocked('https://doubleclick.net/ad', 'a.com')).toBe(true);
    eng.allowSite('a.com');
    expect(eng.isSiteAllowed('a.com')).toBe(true);
    expect(eng.isBlocked('https://doubleclick.net/ad', 'a.com')).toBe(false);
    eng.blockSite('a.com');
    expect(eng.isBlocked('https://doubleclick.net/ad', 'a.com')).toBe(true);
  });

  it('allowlist ignores www prefix', () => {
    const eng = new AdblockEngine(list, ['www.news.example.com']);
    expect(eng.isSiteAllowed('news.example.com')).toBe(true);
  });
});

describe('AdblockEngine — safety & robustness', () => {
  const eng = new AdblockEngine(list);

  it('never throws on unparseable / non-http URLs', () => {
    for (const u of ['about:blank', 'data:text/html,x', 'javascript:void(0)', '', 'not a url']) {
      expect(eng.isBlocked(u)).toBe(false);
    }
  });

  it('handles an empty blocklist', () => {
    const empty = new AdblockEngine([]);
    expect(empty.isBlocked('https://doubleclick.net/')).toBe(false);
    expect(empty.size).toBe(0);
  });

  it('reports size (host + path entries)', () => {
    expect(eng.size).toBe(4); // 3 hosts + 1 path entry
  });
});

describe('AdblockEngine — real DEX blocklist', () => {
  const eng = new AdblockEngine(BLOCKED_DOMAIN_LIST);

  it('loads the shipped blocklist and blocks known ad/tracker hosts', () => {
    expect(eng.size).toBeGreaterThan(80);
    for (const u of [
      'https://securepubads.g.doubleclick.net/gampad/ads',
      'https://www.google-analytics.com/collect',
      'https://cdn.taboola.com/libtrc/x.js',
      'https://static.hotjar.com/c/hotjar.js',
      'https://c.amazon-adsystem.com/aax2/apstag.js',
    ]) {
      expect(eng.isBlocked(u)).toBe(true);
    }
  });

  it('does not block common non-ad hosts', () => {
    for (const u of [
      'https://en.wikipedia.org/',
      'https://cdn.jsdelivr.net/npm/react',
      'https://raw.githubusercontent.com/x/y',
      'https://unpkg.com/three',
    ]) {
      expect(eng.isBlocked(u)).toBe(false);
    }
  });
});
