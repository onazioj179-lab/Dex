// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Missing-resource check for Slides. Pictures chosen from this PC are embedded
// in the deck (data URLs) and cannot go missing; pictures given as a web
// address can (offline, moved, deleted). This finds the ones that do not load
// right now, by slide, so they can be replaced before presenting.

export interface ResourceIssue { slide: number; blockId: string; url: string }

export type ImageProbe = (url: string, timeoutMs: number) => Promise<boolean>;

export const browserProbe: ImageProbe = (url, timeoutMs) => new Promise((resolve) => {
  const img = new Image();
  const t = setTimeout(() => { img.src = ''; resolve(false); }, timeoutMs);
  img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 0); };
  img.onerror = () => { clearTimeout(t); resolve(false); };
  img.src = url;
});

export async function findMissingPictures(
  slides: readonly { blocks: readonly { id: string; type: string; content: string }[] }[],
  probe: ImageProbe = browserProbe,
  timeoutMs = 6000,
): Promise<{ checked: number; missing: ResourceIssue[] }> {
  const refs: ResourceIssue[] = [];
  slides.forEach((s, i) => s.blocks.forEach((b) => {
    if (b.type === 'image' && b.content && !b.content.startsWith('data:')) refs.push({ slide: i + 1, blockId: b.id, url: b.content });
  }));
  const unique = [...new Set(refs.map((r) => r.url))];
  const ok = new Map<string, boolean>();
  await Promise.all(unique.map(async (u) => { ok.set(u, await probe(u, timeoutMs).catch(() => false)); }));
  return { checked: refs.length, missing: refs.filter((r) => !ok.get(r.url)) };
}
