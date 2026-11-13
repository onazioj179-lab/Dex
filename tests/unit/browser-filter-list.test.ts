// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseFilterList, selectorsFor, safeSelector, loadShieldsOff, setShieldsOff, saveFilterList, loadFilterList, DEFAULT_COSMETIC,
} from '../../src/renderer/DEXAPPLICATIONS/browser/filterList';
import { buildAdblockScript } from '../../src/renderer/DEXAPPLICATIONS/browser/adblockContentScript';
import { AdblockEngine } from '../../src/renderer/DEXAPPLICATIONS/browser/adblockEngine';

const LIST = `[Adblock Plus 2.0]
! Title: test list
||ads.example.com^
||tracker.example.net^$third-party
||Cdn.Banner.io^$script,image
||scoped.com^$domain=news.com
||negated.com^$~third-party
@@||ads.example.com^$document
/banner/*/ad.js
##.ad-slot
##div[id^="sponsor-"]
news.com,~blog.news.com##.promo
www.Shop.org##.deal-banner
~only-negated.com##.x
example.com#@#.ad-slot
example.com#?#div:has(> .ad)
example.com##+js(nobab)
##a{color:red}
##@import url(evil.css)
`;

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('filter list parser', () => {
  const r = parseFilterList(LIST);

  it('keeps plain host rules (with resource / third-party options), lower-cased', () => {
    expect(r.hosts.sort()).toEqual(['ads.example.com', 'cdn.banner.io', 'tracker.example.net']);
  });

  it('keeps generic and site hiding; drops negated scopes', () => {
    expect(r.genericHide).toEqual(['.ad-slot', 'div[id^="sponsor-"]']);
    expect(r.siteHide).toEqual({ 'news.com': ['.promo'], 'shop.org': ['.deal-banner'] });
  });

  it('counts everything it cannot honour instead of half-applying it', () => {
    // scoped, negated option, exception, path rule, all-negated scope, #@#, #?#, ##+js, braces, @import
    expect(r.stats.skipped).toBe(10);
    expect(r.stats).toMatchObject({ network: 3, generic: 2, site: 2 });
  });

  it('selector guard blocks at-rules, braces and markup', () => {
    expect(safeSelector('.ad')).toBe(true);
    expect(safeSelector('@import url(x)')).toBe(false);
    expect(safeSelector('a{}')).toBe(false);
    expect(safeSelector('a;b')).toBe(false);
    expect(safeSelector('<script>')).toBe(false);
  });

  it('selectorsFor merges generic with the site and its parent domains', () => {
    expect(selectorsFor(r, 'www.news.com')).toEqual(['.ad-slot', 'div[id^="sponsor-"]', '.promo']);
    expect(selectorsFor(r, 'm.shop.org')).toContain('.deal-banner');
    expect(selectorsFor(r, 'other.com')).toEqual(['.ad-slot', 'div[id^="sponsor-"]']);
  });

  it('imported hosts block subdomains through the engine; Shields off lets the site through', () => {
    const e = new AdblockEngine(r.hosts, ['news.com']);
    expect(e.check('https://x.ads.example.com/a.js').blocked).toBe(true);
    expect(e.check('https://notads.example.com/a.js').blocked).toBe(false);
    expect(e.check('https://x.ads.example.com/a.js', 'news.com').blocked).toBe(false);
  });
});

describe('Shields + list storage', () => {
  it('per-site shields toggle round-trips and normalises hosts', () => {
    const st = new MemStorage();
    expect(setShieldsOff('WWW.News.com', true, st)).toEqual(['news.com']);
    expect(setShieldsOff('shop.org', true, st)).toEqual(['news.com', 'shop.org']);
    expect(setShieldsOff('news.com', false, st)).toEqual(['shop.org']);
    expect(loadShieldsOff(st)).toEqual(['shop.org']);
    st.setItem('dex-browser-shields-off', 'not json');
    expect(loadShieldsOff(st)).toEqual([]);
  });

  it('filter list save / load / remove', () => {
    const st = new MemStorage();
    const p = parseFilterList(LIST);
    expect(saveFilterList({ ...p, name: 'list.txt', importedAt: 1 }, st)).toBe(true);
    expect(loadFilterList(st)?.hosts).toHaveLength(3);
    expect(saveFilterList(null, st)).toBe(true);
    expect(loadFilterList(st)).toBeNull();
  });
});

describe('content script element hiding', () => {
  it('embeds one rule per selector, only when blocking ads', () => {
    const js = buildAdblockScript(['ads.example.com'], { blockAds: true, blockTrackers: true, cosmetic: ['.a', 'div[x="1"]'] });
    expect(js).toContain('.a{display:none !important}');
    expect(js).toContain('div[x=\\"1\\"]{display:none !important}');
    expect(js).toContain('data-dex-cosmetic');
    const off = buildAdblockScript(['ads.example.com'], { blockAds: false, blockTrackers: true, cosmetic: ['.a'] });
    expect(off).not.toContain('.a{display:none');
  });

  it('a hostile selector string cannot break out of the script', () => {
    const js = buildAdblockScript([], { blockAds: true, blockTrackers: false, cosmetic: ['"];alert(1);//'] });
    expect(() => new Function(js)).not.toThrow();
    expect(js).not.toMatch(/\n\s*alert\(1\)/);
  });

  it('built-in hiding list is conservative and all pass the guard', () => {
    expect(DEFAULT_COSMETIC.every(safeSelector)).toBe(true);
    expect(DEFAULT_COSMETIC.some((s) => /^\.ad$|^\[class\*="ad"\]$/.test(s))).toBe(false);
  });
});
