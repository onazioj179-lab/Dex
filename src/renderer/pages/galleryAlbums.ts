// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Gallery user albums: named lists of photos/videos by media id (the file
// path). Albums never move or copy files; removing a photo from an album or
// deleting the album leaves the files alone. Pure; unit-tested.

export interface UserAlbum { id: string; name: string; itemIds: string[]; createdAt: number }

export const ALBUMS_KEY = 'dex-gallery-albums';
export const USER_ALBUM_PREFIX = 'user:';

export function loadAlbums(storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): UserAlbum[] {
  try {
    const v = JSON.parse(storage?.getItem(ALBUMS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string' && Array.isArray(a.itemIds)) : [];
  } catch { return []; }
}

const norm = (s: string) => s.trim().toLowerCase();

/** Add items to the album with this name (created if new, matched case-insensitively). */
export function addToAlbum(albums: UserAlbum[], name: string, itemIds: string[], now = Date.now()): { albums: UserAlbum[]; album: UserAlbum; added: number } {
  const clean = name.trim().slice(0, 60);
  const existing = albums.find((a) => norm(a.name) === norm(clean));
  const base = existing ?? { id: `alb-${now.toString(36)}-${albums.length}`, name: clean, itemIds: [], createdAt: now };
  const have = new Set(base.itemIds);
  const fresh = itemIds.filter((id) => !have.has(id));
  const album = { ...base, itemIds: [...base.itemIds, ...fresh] };
  return { albums: existing ? albums.map((a) => (a.id === album.id ? album : a)) : [...albums, album], album, added: fresh.length };
}

export function removeFromAlbum(albums: UserAlbum[], albumId: string, itemIds: string[]): UserAlbum[] {
  const drop = new Set(itemIds);
  return albums.map((a) => (a.id === albumId ? { ...a, itemIds: a.itemIds.filter((id) => !drop.has(id)) } : a));
}

/** Items that left the library (deleted, moved) drop out of every album. */
export function pruneAlbums(albums: UserAlbum[], liveIds: Set<string>): UserAlbum[] {
  let changed = false;
  const next = albums.map((a) => {
    const kept = a.itemIds.filter((id) => liveIds.has(id));
    if (kept.length !== a.itemIds.length) changed = true;
    return kept.length === a.itemIds.length ? a : { ...a, itemIds: kept };
  });
  return changed ? next : albums;
}
