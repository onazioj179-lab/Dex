// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Mention / tag / link extraction (Notes linking, Nexus relationship building,
 * UKI context). Pulls @people, #tags, [[wiki-links]] and URLs out of free text.
 * De-duplicated, original-order preserving. Pure: no DOM, no IO.
 */

function uniqueMatches(text: string, re: RegExp, group = 1): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    const v = m[group];
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

/** `@name` mentions (letters, digits, _, -, .). */
export function extractMentions(text: string): string[] {
  return uniqueMatches(text, /(?:^|[^\w@])@([\w.-]+)/g);
}

/** `#tag` hashtags. */
export function extractTags(text: string): string[] {
  return uniqueMatches(text, /(?:^|[^\w#])#([\w-]+)/g);
}

/** `[[wiki-link]]` style internal links. */
export function extractWikiLinks(text: string): string[] {
  return uniqueMatches(text, /\[\[([^\]]+)\]\]/g);
}

/** http(s) URLs. */
export function extractUrls(text: string): string[] {
  return uniqueMatches(text, /(https?:\/\/[^\s<>"')]+)/g);
}

export interface ExtractedRefs {
  mentions: string[];
  tags: string[];
  wikiLinks: string[];
  urls: string[];
}

/** All reference kinds at once. */
export function extractRefs(text: string): ExtractedRefs {
  return {
    mentions: extractMentions(text),
    tags: extractTags(text),
    wikiLinks: extractWikiLinks(text),
    urls: extractUrls(text),
  };
}
