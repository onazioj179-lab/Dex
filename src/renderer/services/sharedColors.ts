// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Saved colours shared across apps, stored as `palette` assets in the
 * AssetLibrary (so they persist in dex.db and show up in Spotlight). A colour
 * saved in Colors appears in PRISM's swatches, and the other way round.
 */

import { useEffect, useState } from 'react';
import { AssetLibrary, type AssetMeta } from './AssetLibrary';

const HEX = /^#[0-9a-f]{6}$/i;

export const normalizeHex = (hex: string): string | null => {
  const h = hex.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(h);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return HEX.test(h) ? h.toLowerCase() : null;
};

const idFor = (hex: string) => `color-${hex.slice(1)}`;

/** Colours held by one palette asset (single-colour assets and multi-colour palettes). */
const colorsOf = (a: AssetMeta): string[] => {
  const c = (a.payload as { colors?: unknown }).colors;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === 'string' && !!normalizeHex(x)).map((x) => normalizeHex(x)!) : [];
};

/** All saved colours, newest first, without duplicates. */
export function savedColors(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of AssetLibrary.list('palette').sort((x, y) => y.updatedAt - x.updatedAt)) {
    for (const c of colorsOf(a)) if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
}

export function isColorSaved(hex: string): boolean {
  const h = normalizeHex(hex);
  return !!h && savedColors().includes(h);
}

/** Save a colour to the shared library. Returns false for an invalid colour. */
export function saveColor(hex: string, ownerAppId: string): boolean {
  const h = normalizeHex(hex);
  if (!h) return false;
  AssetLibrary.upsert({ id: idFor(h), kind: 'palette', name: h.toUpperCase(), ownerAppId, tags: ['color'], payload: { colors: [h] } });
  return true;
}

/** Remove a single saved colour (only its own single-colour asset). */
export function removeColor(hex: string): boolean {
  const h = normalizeHex(hex);
  return !!h && AssetLibrary.remove('palette', idFor(h));
}

/** Live list of saved colours. */
export function useSavedColors(): string[] {
  const [colors, setColors] = useState<string[]>(() => savedColors());
  useEffect(() => AssetLibrary.subscribe('palette', () => setColors(savedColors())), []);
  return colors;
}
