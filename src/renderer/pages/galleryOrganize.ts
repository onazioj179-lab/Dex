// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { addToAlbum, removeFromAlbum, type UserAlbum } from './galleryAlbums';

export type GalleryTags = Record<string, string[]>;
export const TAGS_KEY = 'dex-gallery-tags-v1';

export function loadGalleryTags(): GalleryTags {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(TAGS_KEY) ?? '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).flatMap(([id, list]) => {
      return Array.isArray(list) ? [[id, list.filter(tag => typeof tag === 'string').slice(0, 30)]] : [];
    }));
  } catch { return {}; }
}

export function tagMedia(tags: GalleryTags, ids: string[], label: string): GalleryTags {
  const name = label.trim().slice(0, 40);
  if (!name) return tags;
  const next = { ...tags };
  for (const id of ids) {
    const previous = Object.hasOwn(tags, id) ? tags[id] : [];
    if (previous.length < 30 && !previous.some(tag => tag.toLowerCase() === name.toLowerCase())) {
      Object.defineProperty(next, id, { value: [...previous, name], writable: true, enumerable: true, configurable: true });
    }
  }
  return next;
}

export function moveAlbumItems(albums: UserAlbum[], from: UserAlbum, name: string, ids: string[]): UserAlbum[] {
  if (!name.trim() || name.trim().toLowerCase() === from.name.toLowerCase()) return albums;
  const origin = albums.find(album => album.id === from.id);
  if (!origin) return albums;
  const allowed = new Set(origin.itemIds);
  const moving = ids.filter(id => allowed.has(id));
  if (!moving.length) return albums;
  const added = addToAlbum(albums, name, moving);
  return removeFromAlbum(added.albums, from.id, moving);
}

export function galleryFolder(id: string): string {
  const path = id.replace(/\\/g, '/');
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

export function galleryBreadcrumbs(id: string) {
  const folder = galleryFolder(id);
  return folder.split('/').flatMap((label, index, names) => label ? [{ label, path: names.slice(0, index + 1).join('/') }] : []);
}

export function duplicateImageKey(item: { type: string; name: string; size: number }): string | null {
  if (item.type !== 'image' || !Number.isFinite(item.size) || item.size <= 0) return null;
  const name = item.name.trim().toLowerCase().replace(/\s*(?:\(\d+\)|[- ]copy(?: \d+)?)\s*(?=\.[^.]+$)/i, '');
  return name + ':' + item.size;
}

export async function smallImageQrData(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image conversion is unavailable.');
    for (const edge of [48, 36, 26, 18]) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL('image/jpeg', 0.45);
      if (encoded.startsWith('data:image/jpeg;base64,') && encoded.length <= 1100) return encoded;
    }
    throw new Error('This preview will not fit in a QR code.');
  } finally { URL.revokeObjectURL(url); }
}
