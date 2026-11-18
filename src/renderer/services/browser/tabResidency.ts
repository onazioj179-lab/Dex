// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Browser tab residency: which tabs keep a live web page and which sleep.
//
// Every Browser tab is a WebView2 page (its own renderer process and memory).
// Tab metadata is cheap; live pages are not. So:
//   - the active tab is always live;
//   - protected tabs stay live (playing audible media, edited form fields, or
//     "Keep awake" set by the user);
//   - after that, the most recently used tabs stay live up to a budget that
//     follows the device performance tier (Resource Saver = smallest);
//   - every other tab sleeps: no page, no timers, just its saved URL and
//     title. Selecting it loads it again at its URL (page state such as
//     scroll position or unsent form text is not guaranteed to survive).
//   - restored tabs that were never selected this session sleep, so a large
//     saved session opens one page, not hundreds.

import type { DeviceTier } from '../TierManager';

export interface ResidencyTab {
  id: string;
  url: string;
  pinned?: boolean;
  keepAwake?: boolean;
}

export interface ResidencyInput {
  tabs: ResidencyTab[];
  activeId: string;
  /** Last time each tab was the active one (ms). Missing = never this session. */
  lastActiveAt: ReadonlyMap<string, number>;
  /** Tabs a page check found playing audible media or holding edited fields. */
  busy: ReadonlySet<string>;
  /** Live background tabs allowed besides the active and protected ones. */
  budget: number;
}

/** Live background pages per tier (the active tab is extra). */
export const LIVE_TAB_BUDGET: Record<DeviceTier, number> = { low: 1, mid: 3, high: 5, ultra: 8 };

export function liveTabBudget(tier: DeviceTier | null | undefined, setting: 'auto' | number = 'auto'): number {
  if (typeof setting === 'number' && Number.isFinite(setting)) return Math.max(0, Math.min(50, Math.floor(setting)));
  return LIVE_TAB_BUDGET[tier ?? 'mid'] ?? LIVE_TAB_BUDGET.mid;
}

/** Ids of tabs that should have a live page. Everything else sleeps. */
export function computeLiveTabs({ tabs, activeId, lastActiveAt, busy, budget }: ResidencyInput): Set<string> {
  const live = new Set<string>();
  const candidates: ResidencyTab[] = [];
  for (const t of tabs) {
    if (!t.url) continue; // a blank tab has no page to keep
    if (t.id === activeId || t.keepAwake || busy.has(t.id)) { live.add(t.id); continue; }
    if (lastActiveAt.has(t.id)) candidates.push(t);
  }
  // Pinned first, then most recently used.
  candidates.sort((a, b) =>
    (Number(!!b.pinned) - Number(!!a.pinned)) || ((lastActiveAt.get(b.id) ?? 0) - (lastActiveAt.get(a.id) ?? 0)));
  for (const t of candidates.slice(0, Math.max(0, budget))) live.add(t.id);
  return live;
}

/**
 * Page-side check run right before a tab would sleep. Returns
 * '{"media":bool,"edited":bool}'. Read-only: it touches nothing on the page.
 */
export const PAGE_BUSY_CHECK = `(function(){try{
var m=Array.prototype.some.call(document.querySelectorAll('video,audio'),function(x){return !x.paused&&!x.ended&&!x.muted&&x.volume>0;});
var e=Array.prototype.some.call(document.querySelectorAll('input,textarea'),function(x){var t=(x.type||'').toLowerCase();if(t==='hidden'||t==='password'||t==='checkbox'||t==='radio'||t==='submit'||t==='button')return false;return x.value!==x.defaultValue;});
var a=document.activeElement;if(!e&&a&&a.isContentEditable)e=true;
return JSON.stringify({media:m,edited:e});}catch(_){return JSON.stringify({media:false,edited:false});}})()`;

export function parseBusyCheck(raw: unknown): { media: boolean; edited: boolean } {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { media: v?.media === true, edited: v?.edited === true };
  } catch {
    return { media: false, edited: false };
  }
}
