// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Browser — filter lists (EasyList / uBlock syntax, the parts DEX can
 * honour) and per-site Shields.
 *
 * Supported:
 *   ||host^            block that host and its subdomains (also with
 *                      $third-party / resource-type options)
 *   ##selector         hide matching elements on every site
 *   a.com,b.org##sel   hide on those sites (and their subdomains)
 * Skipped and counted (never half-applied): exceptions (@@), scoped
 * `$domain=` rules, regex/path rules, procedural / scriptlet cosmetics
 * (#?#, #$#, ##+js), and cosmetic exceptions (#@#).
 */

export interface FilterList {
  hosts: string[];
  genericHide: string[];
  siteHide: Record<string, string[]>;
}

export interface ParsedFilterList extends FilterList {
  stats: { network: number; generic: number; site: number; skipped: number; lines: number };
}

export const FILTER_CAPS = { hosts: 40_000, generic: 15_000, site: 20_000 } as const;

const OK_OPTIONS = new Set(['third-party', '3p', 'script', 'image', 'subdocument', 'xmlhttprequest', 'xhr', 'ping', 'media', 'object', 'stylesheet', 'font', 'other', 'all']);
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;

/** A selector DEX will put in a stylesheet: no braces or markup, sane length. */
export function safeSelector(sel: string): boolean {
  const s = sel.trim();
  // No braces/markup/comments, and no `@` or `;` so a "selector" can never
  // become an at-rule such as @import (a network request from the page).
  return s.length > 0 && s.length <= 400 && !/[{}<>;@]|\/\*|\\$/.test(s) && !/^[+:]/.test(s);
}

export function normalizeHost(h: string): string {
  let s = (h || '').trim().toLowerCase().replace(/\.$/, '');
  if (s.startsWith('www.')) s = s.slice(4);
  return s;
}

export function parseFilterList(text: string): ParsedFilterList {
  const hosts = new Set<string>();
  const generic = new Set<string>();
  const site: Record<string, Set<string>> = {};
  let siteCount = 0;
  let skipped = 0;
  let lines = 0;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    lines++;
    if (line.startsWith('@@') || /#@#|#\?#|#\$#|##\+js|#%#/.test(line)) { skipped++; continue; }

    const hideAt = line.indexOf('##');
    if (hideAt >= 0) {
      const sel = line.slice(hideAt + 2).trim();
      if (!safeSelector(sel)) { skipped++; continue; }
      const scope = line.slice(0, hideAt).trim();
      if (!scope) {
        if (generic.size < FILTER_CAPS.generic) generic.add(sel); else skipped++;
        continue;
      }
      const doms = scope.split(',').map((d) => d.trim()).filter((d) => d && !d.startsWith('~')).map(normalizeHost).filter((d) => HOST_RE.test(d));
      if (!doms.length) { skipped++; continue; }
      for (const d of doms) {
        if (siteCount >= FILTER_CAPS.site) { skipped++; break; }
        (site[d] ??= new Set()).add(sel);
        siteCount++;
      }
      continue;
    }

    const m = /^\|\|([a-z0-9.-]+)\^(?:\$(.*))?$/i.exec(line);
    if (m) {
      const host = normalizeHost(m[1]);
      const opts = (m[2] || '').split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);
      if (!HOST_RE.test(host) || opts.some((o) => !OK_OPTIONS.has(o.replace(/^~/, '')) || o.startsWith('~'))) { skipped++; continue; }
      if (hosts.size < FILTER_CAPS.hosts) hosts.add(host); else skipped++;
      continue;
    }
    skipped++;
  }
  const siteHide: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(site)) siteHide[k] = [...v];
  return {
    hosts: [...hosts],
    genericHide: [...generic],
    siteHide,
    stats: { network: hosts.size, generic: generic.size, site: siteCount, skipped, lines },
  };
}

/** Selectors that apply on `host`: generic + every site rule for it or a parent domain. */
export function selectorsFor(list: Pick<FilterList, 'genericHide' | 'siteHide'>, host: string): string[] {
  const h = normalizeHost(host);
  const out = [...list.genericHide];
  if (!h) return out;
  const parts = h.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join('.');
    const s = list.siteHide[d];
    if (s) out.push(...s);
  }
  return out;
}

/**
 * Conservative built-in element hiding: only ids/classes/attributes ad
 * networks themselves stamp on their slots, so ordinary page content named
 * "ad…" is never hidden.
 */
export const DEFAULT_COSMETIC: readonly string[] = [
  'ins.adsbygoogle',
  '[id^="div-gpt-ad"]',
  '[id^="google_ads_iframe"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="doubleclick.net"]',
  '[data-google-query-id]',
  'amp-ad',
  'amp-embed[type="taboola"]',
  '[id^="taboola-"]',
  '.trc_rbox_container',
  '.OUTBRAIN',
  '[data-widget-id^="AR_"]',
];

// ---------------------------------------------------------------------------
// Storage (per-viewer, this machine): imported list + sites with Shields down.
// ---------------------------------------------------------------------------

export const FILTERS_KEY = 'dex-browser-filter-list';
export const SHIELDS_OFF_KEY = 'dex-browser-shields-off';
export const SHIELDS_CHANGED = 'dex-browser-shields-changed';

export interface StoredFilterList extends FilterList { name: string; importedAt: number; stats: ParsedFilterList['stats'] }

export function loadFilterList(storage: Pick<Storage, 'getItem'> | null = safeStorage()): StoredFilterList | null {
  try {
    const v = JSON.parse(storage?.getItem(FILTERS_KEY) ?? 'null');
    if (!v || !Array.isArray(v.hosts) || !Array.isArray(v.genericHide) || typeof v.siteHide !== 'object') return null;
    return v as StoredFilterList;
  } catch { return null; }
}

/** Returns false when storage refused it (quota), so the UI can say so. */
export function saveFilterList(list: StoredFilterList | null, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage()): boolean {
  try {
    if (!storage) return false;
    if (list) storage.setItem(FILTERS_KEY, JSON.stringify(list)); else storage.removeItem(FILTERS_KEY);
    return true;
  } catch { return false; }
}

export function loadShieldsOff(storage: Pick<Storage, 'getItem'> | null = safeStorage()): string[] {
  try {
    const v = JSON.parse(storage?.getItem(SHIELDS_OFF_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(normalizeHost) : [];
  } catch { return []; }
}

export function setShieldsOff(host: string, off: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): string[] {
  const h = normalizeHost(host);
  const set = new Set(loadShieldsOff(storage));
  if (off) set.add(h); else set.delete(h);
  const out = [...set].sort();
  try { storage?.setItem(SHIELDS_OFF_KEY, JSON.stringify(out)); } catch { /* unavailable */ }
  return out;
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
