// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Maps: coordinates typed into search, and track files.
 *
 *  - parseCoordinates: "6.5244, 3.3792", "6.5244 3.3792", "-33.86,151.21",
 *    "48°51'29.6\"N 2°17'40.2\"E", "48 51 29.6 N, 2 17 40.2 E", "N 48.858 E 2.294".
 *    Goes straight to the spot, offline, without a geocoder.
 *  - parseTrackFile: GPX (tracks, routes, waypoints), KML (LineString / Point
 *    placemarks) and GeoJSON (LineString / MultiLineString / Polygon outline /
 *    Point features) into one shape the map draws.
 *  - toGpx: saved places as waypoints and the shown track / route as a track.
 */

export interface LatLon { lat: number; lon: number }

const NUM = '[-+]?\\d+(?:[.,]\\d+)?';

function dmsToDecimal(deg: number, min = 0, sec = 0, hemi = ''): number {
  const v = Math.abs(deg) + min / 60 + sec / 3600;
  return (deg < 0 || /[SW]/i.test(hemi)) ? -v : v;
}

function valid(lat: number, lon: number): LatLon | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7 };
}

export function parseCoordinates(input: string): LatLon | null {
  const s = input.trim().replace(/[′’']/g, "'").replace(/[″”"]/g, '"').replace(/º/g, '°');
  if (!s || s.length > 80) return null;
  // Decimal pair: "lat, lon" or "lat lon".
  let m = new RegExp(`^(${NUM})\\s*[,; ]\\s*(${NUM})$`).exec(s);
  if (m && /\d[.]\d|^[-+]?\d{1,3}$/.test(m[1])) {
    return valid(parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.')));
  }
  // Degrees / minutes / seconds with hemispheres, either order of letter and number.
  const part = `(?:([NSEW])\\s*)?(${NUM})\\s*°?\\s*(?:(${NUM})\\s*'?\\s*)?(?:(${NUM})\\s*"?\\s*)?(?:([NSEW]))?`;
  m = new RegExp(`^${part}\\s*[, ]?\\s*${part}$`, 'i').exec(s);
  if (m) {
    const h1 = (m[1] || m[5] || '').toUpperCase(), h2 = (m[6] || m[10] || '').toUpperCase();
    if (!h1 && !h2 && !s.includes('°')) return null;
    const a = dmsToDecimal(parseFloat(m[2]), m[3] ? parseFloat(m[3]) : 0, m[4] ? parseFloat(m[4]) : 0, h1);
    const b = dmsToDecimal(parseFloat(m[7]), m[8] ? parseFloat(m[8]) : 0, m[9] ? parseFloat(m[9]) : 0, h2);
    // A letter decides which is latitude; default order is lat, lon.
    if (/[EW]/.test(h1) || /[NS]/.test(h2)) return valid(b, a);
    return valid(a, b);
  }
  return null;
}

export function formatCoordinates(p: LatLon): string {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(5)}° ${v < 0 ? neg : pos}`;
  return `${f(p.lat, 'N', 'S')}, ${f(p.lon, 'E', 'W')}`;
}

// --- Tracks ------------------------------------------------------------------------

export interface TrackData {
  name: string;
  /** Lines as [lon, lat] pairs (GeoJSON order). */
  lines: Array<Array<[number, number]>>;
  points: Array<{ name: string; lat: number; lon: number }>;
}

function num(v: string | null | undefined): number { return v == null ? NaN : parseFloat(v); }

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The file is not valid XML.');
  return doc;
}

/** Elements by local name, ignoring namespaces (GPX 1.0/1.1, KML 2.2 with prefixes). */
function byName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name));
}

function parseGpx(text: string, fallbackName: string): TrackData {
  const doc = parseXml(text);
  const name = byName(doc, 'name')[0]?.textContent?.trim() || fallbackName;
  const lines: TrackData['lines'] = [];
  for (const seg of [...byName(doc, 'trkseg'), ...byName(doc, 'rte')]) {
    const pts = [...byName(seg, 'trkpt'), ...byName(seg, 'rtept')]
      .map((p) => [num(p.getAttribute('lon')), num(p.getAttribute('lat'))] as [number, number])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (pts.length > 1) lines.push(pts);
  }
  const points = byName(doc, 'wpt').map((w) => ({
    name: byName(w, 'name')[0]?.textContent?.trim() || 'Waypoint', lat: num(w.getAttribute('lat')), lon: num(w.getAttribute('lon')),
  })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  return { name, lines, points };
}

function kmlCoords(text: string): Array<[number, number]> {
  return text.trim().split(/\s+/).map((t) => t.split(',').map(Number)).filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])).map((c) => [c[0], c[1]] as [number, number]);
}

function parseKml(text: string, fallbackName: string): TrackData {
  const doc = parseXml(text);
  const name = byName(doc, 'Document')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim() || fallbackName;
  const lines: TrackData['lines'] = [];
  const points: TrackData['points'] = [];
  for (const pm of byName(doc, 'Placemark')) {
    const pmName = byName(pm, 'name')[0]?.textContent?.trim() || 'Place';
    for (const ls of [...byName(pm, 'LineString'), ...byName(pm, 'LinearRing')]) {
      const c = kmlCoords(byName(ls, 'coordinates')[0]?.textContent || '');
      if (c.length > 1) lines.push(c);
    }
    // gx:Track uses <gx:coord>lon lat alt</gx:coord>.
    const gx = byName(pm, 'coord').map((e) => (e.textContent || '').trim().split(/\s+/).map(Number)).filter((c) => c.length >= 2).map((c) => [c[0], c[1]] as [number, number]);
    if (gx.length > 1) lines.push(gx);
    for (const pt of byName(pm, 'Point')) {
      const c = kmlCoords(byName(pt, 'coordinates')[0]?.textContent || '')[0];
      if (c) points.push({ name: pmName, lon: c[0], lat: c[1] });
    }
  }
  return { name, lines, points };
}

function parseGeoJson(text: string, fallbackName: string): TrackData {
  let gj: unknown;
  try { gj = JSON.parse(text); } catch { throw new Error('The file is not valid GeoJSON.'); }
  const lines: TrackData['lines'] = [];
  const points: TrackData['points'] = [];
  const pair = (c: unknown): [number, number] | null => (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0] as number, c[1] as number] : null);
  const take = (geom: { type?: string; coordinates?: unknown; geometries?: unknown[] } | null | undefined, name: string) => {
    if (!geom) return;
    const c = geom.coordinates as unknown[];
    switch (geom.type) {
      case 'Point': { const p = pair(c); if (p) points.push({ name, lon: p[0], lat: p[1] }); break; }
      case 'MultiPoint': for (const x of c) { const p = pair(x); if (p) points.push({ name, lon: p[0], lat: p[1] }); } break;
      case 'LineString': lines.push(c.map(pair).filter(Boolean) as Array<[number, number]>); break;
      case 'MultiLineString': case 'Polygon': for (const l of c as unknown[][]) lines.push(l.map(pair).filter(Boolean) as Array<[number, number]>); break;
      case 'MultiPolygon': for (const poly of c as unknown[][][]) for (const l of poly) lines.push(l.map(pair).filter(Boolean) as Array<[number, number]>); break;
      case 'GeometryCollection': for (const g of geom.geometries ?? []) take(g as never, name); break;
      default: break;
    }
  };
  const root = gj as { type?: string; features?: unknown[]; geometry?: unknown; properties?: { name?: string } };
  const feats = root.type === 'FeatureCollection' ? root.features ?? [] : root.type === 'Feature' ? [root] : [{ geometry: root, properties: {} }];
  for (const f of feats as Array<{ geometry?: never; properties?: { name?: string; title?: string } }>) take(f.geometry, f.properties?.name || f.properties?.title || 'Place');
  return { name: fallbackName, lines: lines.filter((l) => l.length > 1), points };
}

export function parseTrackFile(fileName: string, text: string): TrackData {
  const base = fileName.replace(/\.[^.]+$/, '') || 'Track';
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const head = text.trimStart().slice(0, 300);
  let t: TrackData;
  if (ext === 'gpx' || /<gpx[\s>]/i.test(head)) t = parseGpx(text, base);
  else if (ext === 'kml' || /<kml[\s>]/i.test(head)) t = parseKml(text, base);
  else if (ext === 'geojson' || ext === 'json' || head.startsWith('{')) t = parseGeoJson(text, base);
  else throw new Error('Open a GPX, KML or GeoJSON file.');
  if (!t.lines.length && !t.points.length) throw new Error('No tracks or places were found in this file.');
  return t;
}

/** Total length of the lines in kilometres (haversine). */
export function trackLengthKm(t: Pick<TrackData, 'lines'>): number {
  const R = 6371;
  let km = 0;
  for (const l of t.lines) {
    for (let i = 1; i < l.length; i++) {
      const [lon1, lat1] = l[i - 1], [lon2, lat2] = l[i];
      const dLat = ((lat2 - lat1) * Math.PI) / 180, dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      km += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    }
  }
  return km;
}

/** [[west, south], [east, north]] around everything, or null. */
export function trackBounds(t: TrackData): [[number, number], [number, number]] | null {
  const xs: number[] = [], ys: number[] = [];
  for (const l of t.lines) for (const [x, y] of l) { xs.push(x); ys.push(y); }
  for (const p of t.points) { xs.push(p.lon); ys.push(p.lat); }
  if (!xs.length) return null;
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** GPX 1.1: places as waypoints, lines as one track. */
export function toGpx(name: string, places: Array<{ name: string; lat: number; lon: number; detail?: string }>, lines: Array<Array<[number, number]>> = []): string {
  const wpts = places.map((p) => `  <wpt lat="${p.lat}" lon="${p.lon}"><name>${xmlEsc(p.name)}</name>${p.detail ? `<desc>${xmlEsc(p.detail)}</desc>` : ''}</wpt>`);
  const trk = lines.length
    ? [`  <trk><name>${xmlEsc(name)}</name>`, ...lines.map((l) => `    <trkseg>${l.map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"/>`).join('')}</trkseg>`), '  </trk>']
    : [];
  return ['<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="DEX Maps" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${xmlEsc(name)}</name></metadata>`, ...wpts, ...trk, '</gpx>', ''].join('\n');
}
