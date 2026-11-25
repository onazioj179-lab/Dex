// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Maps network services (no keys, OpenStreetMap data):
 *   - place search: Photon (addresses, streets, landmarks, businesses), biased
 *     to the map view. The old search (Open-Meteo) only knows city names, so
 *     "221B Baker Street" or "Eiffel Tower" found nothing.
 *   - reverse geocoding: what is at a dropped pin.
 *   - directions: OSRM on routing.openstreetmap.de (car, bike, foot) with
 *     turn-by-turn steps.
 * Every call fails honestly: offline / service errors are reported, never
 * shown as "nothing found".
 */

export interface Place { name: string; detail: string; lat: number; lon: number }
export type ServiceError = null | 'offline' | 'service';
export interface PlaceSearch { results: Place[]; error: ServiceError }

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const errorOf = (e: unknown): ServiceError => {
  if ((e as { name?: string })?.name === 'AbortError') return 'service';
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'service';
};

interface PhotonProps {
  name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; district?: string;
  locality?: string; county?: string; state?: string; country?: string; osm_value?: string; type?: string;
}
interface PhotonFeature { geometry?: { coordinates?: unknown[] }; properties?: PhotonProps }

/** One Photon feature -> a Place (name line + context line), or null when malformed. */
export function photonPlace(f: PhotonFeature): Place | null {
  const [lon, lat] = (f?.geometry?.coordinates ?? []) as unknown[];
  if (!isNum(lat) || !isNum(lon)) return null;
  const p = f.properties ?? {};
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const name = p.name || street || p.city || p.state || p.country;
  if (!name) return null;
  const town = p.city || p.locality || p.district || p.county;
  const ctx = [street && street !== name ? street : '', town !== name ? town : '', p.state !== name ? p.state : '', p.country !== name ? p.country : '']
    .filter(Boolean);
  // Drop repeated parts ("Paris, Paris, France").
  const detail = ctx.filter((v, i) => ctx.indexOf(v) === i).join(', ');
  return { name, detail, lat, lon };
}

/** Search addresses / places, ranked near `near` (the map centre) when given. */
export async function searchPlaces(
  q: string, fetcher: typeof fetch = fetch, signal?: AbortSignal, near?: { lat: number; lon: number },
): Promise<PlaceSearch> {
  const query = q.trim();
  if (!query) return { results: [], error: null };
  const bias = near && isNum(near.lat) && isNum(near.lon) ? `&lat=${near.lat.toFixed(4)}&lon=${near.lon.toFixed(4)}` : '';
  try {
    const res = await fetcher(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en${bias}`, { signal });
    if (!res.ok) return { results: [], error: 'service' };
    const data = await res.json() as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const results: Place[] = [];
    for (const f of Array.isArray(data?.features) ? data.features : []) {
      const p = photonPlace(f);
      if (!p) continue;
      const key = `${p.name}|${p.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(p);
    }
    return { results: results.slice(0, 6), error: null };
  } catch (e) {
    return { results: [], error: errorOf(e) };
  }
}

/** What is at a coordinate (a street address or a place name), or null. */
export async function reversePlace(lat: number, lon: number, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<Place | null> {
  try {
    const res = await fetcher(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`, { signal });
    if (!res.ok) return null;
    const data = await res.json() as { features?: PhotonFeature[] };
    const f = Array.isArray(data?.features) ? data.features[0] : undefined;
    const p = f ? photonPlace(f) : null;
    // Keep the exact clicked point; the address is the label.
    return p ? { ...p, lat, lon } : null;
  } catch {
    return null;
  }
}

// -- directions ---------------------------------------------------------------

export type TravelMode = 'car' | 'bike' | 'foot';
export const TRAVEL_MODES: { value: TravelMode; label: string }[] = [
  { value: 'car', label: 'Drive' }, { value: 'bike', label: 'Cycle' }, { value: 'foot', label: 'Walk' },
];

export interface RouteStep { text: string; distance: number; duration: number; lat: number; lon: number; kind: string }
export interface Route { distance: number; duration: number; coordinates: [number, number][]; steps: RouteStep[] }
export interface RouteOutcome { route: Route | null; error: null | 'offline' | 'service' | 'no-route' }

export function routeUrl(mode: TravelMode, from: { lat: number; lon: number }, to: { lat: number; lon: number }): string {
  const pt = (p: { lat: number; lon: number }) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;
  return `https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${pt(from)};${pt(to)}?overview=full&geometries=geojson&steps=true`;
}

const ORDINAL = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const BEARING_WORD = (b: number) => ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(((b % 360) + 360) % 360 / 45) % 8];

interface OsrmStep {
  name?: string; ref?: string; distance?: number; duration?: number;
  maneuver?: { type?: string; modifier?: string; location?: unknown[]; bearing_after?: number; exit?: number };
}

/** Plain-English instruction for one OSRM step. */
export function stepText(s: OsrmStep): string {
  const m = s.maneuver ?? {};
  const road = s.name || s.ref || '';
  const onto = road ? ` onto ${road}` : '';
  const mod = m.modifier ?? '';
  const turn = mod === 'straight' ? 'Continue straight' : mod === 'uturn' ? 'Make a U-turn'
    : mod.startsWith('slight ') ? `Bear ${mod.slice(7)}` : mod ? `Turn ${mod}` : 'Continue';
  switch (m.type) {
    case 'depart': return `Head ${BEARING_WORD(m.bearing_after ?? 0)}${road ? ` on ${road}` : ''}`;
    case 'arrive': return mod === 'left' || mod === 'right' ? `Arrive at your destination, on the ${mod}` : 'Arrive at your destination';
    case 'roundabout': case 'rotary': return `At the roundabout, take the ${ORDINAL(m.exit ?? 1)} exit${onto}`;
    case 'exit roundabout': case 'exit rotary': return `Exit the roundabout${onto}`;
    case 'merge': return `Merge${mod ? ` ${mod}` : ''}${onto}`;
    case 'on ramp': return `Take the ramp${mod ? ` on the ${mod.replace('slight ', '')}` : ''}${onto}`;
    case 'off ramp': return `Take the exit${mod ? ` on the ${mod.replace('slight ', '')}` : ''}${onto}`;
    case 'fork': return `Keep ${mod.includes('left') ? 'left' : mod.includes('right') ? 'right' : 'straight'} at the fork${onto}`;
    case 'end of road': return `At the end of the road, turn ${mod.replace('slight ', '') || 'ahead'}${onto}`;
    case 'continue': case 'new name':
      if (mod === 'uturn' || mod.startsWith('slight ')) return `${turn}${onto}`;
      return `Continue${mod && mod !== 'straight' ? ` ${mod}` : ''}${onto}`;
    default: return `${turn}${onto}`;
  }
}

export async function fetchRoute(
  mode: TravelMode, from: { lat: number; lon: number }, to: { lat: number; lon: number },
  fetcher: typeof fetch = fetch, signal?: AbortSignal,
): Promise<RouteOutcome> {
  try {
    const res = await fetcher(routeUrl(mode, from, to), { signal });
    const data = await res.json().catch(() => null) as { code?: string; routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: unknown[] }; legs?: Array<{ steps?: OsrmStep[] }> }> } | null;
    if (data?.code === 'NoRoute' || data?.code === 'NoSegment') return { route: null, error: 'no-route' };
    if (!res.ok || !data) return { route: null, error: 'service' };
    const r = data.routes?.[0];
    if (!r || !isNum(r.distance) || !isNum(r.duration)) return { route: null, error: 'no-route' };
    const coordinates = (r.geometry?.coordinates ?? []).filter((c): c is [number, number] =>
      Array.isArray(c) && isNum(c[0]) && isNum(c[1])) as [number, number][];
    const steps: RouteStep[] = [];
    for (const s of r.legs?.flatMap(l => l.steps ?? []) ?? []) {
      const [lon, lat] = (s.maneuver?.location ?? []) as unknown[];
      if (!isNum(lat) || !isNum(lon)) continue;
      steps.push({ text: stepText(s), distance: isNum(s.distance) ? s.distance : 0, duration: isNum(s.duration) ? s.duration : 0, lat, lon, kind: s.maneuver?.type ?? '' });
    }
    if (coordinates.length < 2) return { route: null, error: 'no-route' };
    return { route: { distance: r.distance, duration: r.duration, coordinates, steps }, error: null };
  } catch (e) {
    return { route: null, error: errorOf(e) };
  }
}

/** "350 m", "1.2 km" (metric) */
export function formatDistance(m: number): string {
  if (!isNum(m) || m < 0) return '';
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
}

/** "4 min", "1 h 05 min" */
export function formatDuration(s: number): string {
  if (!isNum(s) || s < 0) return '';
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')} min`;
}
