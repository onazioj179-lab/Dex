// =============================================================================
// DEX Platform — Track G1: Photo library / smart albums
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
export interface PhotoMeta {
  id: string;
  path: string;
  takenAtMs?: number;
  /** EXIF GPS in decimal degrees. */
  gps?: { lat: number; lon: number };
  /** People (face cluster ids). */
  faces: string[];
  /** ML scene labels. */
  labels: string[];
  width: number;
  height: number;
}

export interface PlaceCluster {
  /** Stable place id (e.g. 'paris-fr'). */
  id: string;
  name: string;
  /** Center of the cluster. */
  center: { lat: number; lon: number };
  /** Radius in km used to assign photos. */
  radiusKm: number;
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function assignPlace(p: PhotoMeta, places: ReadonlyArray<PlaceCluster>): string | null {
  if (!p.gps) return null;
  let best: { id: string; d: number } | null = null;
  for (const pl of places) {
    const d = haversineKm(p.gps, pl.center);
    if (d <= pl.radiusKm && (best === null || d < best.d)) best = { id: pl.id, d };
  }
  return best?.id ?? null;
}

export interface SmartAlbumDef {
  id: string;
  name: string;
  /** All conditions must match. */
  faces?: string[];
  labels?: string[];
  placeId?: string;
  /** ms range. */
  takenBetween?: { fromMs: number; toMs: number };
}

export function runSmartAlbum(photos: ReadonlyArray<PhotoMeta>, def: SmartAlbumDef, places: ReadonlyArray<PlaceCluster>): PhotoMeta[] {
  return photos.filter(p => {
    if (def.faces?.length && !def.faces.every(f => p.faces.includes(f))) return false;
    if (def.labels?.length && !def.labels.every(l => p.labels.includes(l))) return false;
    if (def.placeId && assignPlace(p, places) !== def.placeId) return false;
    if (def.takenBetween) {
      if (!p.takenAtMs) return false;
      if (p.takenAtMs < def.takenBetween.fromMs || p.takenAtMs > def.takenBetween.toMs) return false;
    }
    return true;
  });
}

/** Group photos into face clusters via simple connected-component pass. */
export function clusterFaces(photos: ReadonlyArray<PhotoMeta>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of photos) {
    for (const f of p.faces) {
      if (!out.has(f)) out.set(f, []);
      out.get(f)!.push(p.id);
    }
  }
  return out;
}
