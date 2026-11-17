// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Maps -- interactive vector maps and navigation.
 *
 * Rendering: MapLibre GL with free, key-less OpenFreeMap vector tiles, plus a
 *            key-less ESRI World Imagery raster style for satellite and a
 *            terrain raster style.
 * Search:    Open-Meteo geocoding (free, no key -- same source DEX Weather uses)
 *            with debounced autocomplete + a localStorage recent-searches list.
 * Saved:     Star a place to persist it (name + coords) to localStorage and
 *            jump back to it later.
 * Distance:  Drop two pins (or pick two saved places) and read the great-circle
 *            (haversine) distance in km / mi.
 * Pin:       Click the map to drop a pin and copy its coordinates to the
 *            clipboard; send the place + coords to Notes.
 * UKI-driven: listens for the `dex-maps-goto` window event so the assistant can
 *             navigate the map ("show me Tokyo"), and mirrors the current view
 *             into a [data-app-content] node so UKI's screen-context picks it up.
 *
 * Styling stays deliberately neutral (DEX tokens, hairline chrome, no brand
 * color noise) -- the map itself is the only saturated surface.
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import DexIcon from '../../components/DexIcon';
import { canvasColor } from '../../utils/canvasTheme';
import { useWorkingPhrase } from '../../hooks/useWorkingPhrase';
import { DexSearchInput } from '../../styles/components';
import { AppErrorState } from '../../ui/AppStates';
import { useAppTracking } from '../../services/usePatternLearning';
import { sendToNotes } from '../../services/sendTo';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';

// Free, key-less basemap styles. Vector styles come from OpenFreeMap; the
// satellite + terrain styles are built inline from key-less raster tile sources
// (ESRI World Imagery, OpenTopoMap) so the style switch covers the three classic
// map modes.
const RASTER_STYLE = (tiles: string[], attribution: string): maplibregl.StyleSpecification => ({
  version: 8,
  sources: { raster: { type: 'raster', tiles, tileSize: 256, attribution } },
  layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
});

const MAP_STYLES: Record<string, { style: string | maplibregl.StyleSpecification; label: string; icon: string }> = {
  liberty: { style: 'https://tiles.openfreemap.org/styles/liberty', label: 'Streets', icon: 'maps' },
  satellite: {
    style: RASTER_STYLE(
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Esri, Maxar, Earthstar Geographics',
    ),
    label: 'Satellite',
    icon: 'globe',
  },
  terrain: {
    style: RASTER_STYLE(
      ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
      'OpenTopoMap (CC-BY-SA), OpenStreetMap contributors',
    ),
    label: 'Terrain',
    icon: 'layers',
  },
};
type StyleKey = keyof typeof MAP_STYLES;
const STYLE_ORDER: StyleKey[] = ['liberty', 'satellite', 'terrain'];

interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  detail: string;
}

interface SavedPlace {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

const RECENT_KEY = 'dex.maps.recent';
const SAVED_KEY = 'dex.maps.saved';

// -- localStorage helpers (guarded) ------------------------------------------
function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveList<T>(key: string, list: T[]): void {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* quota / disabled -- ignore */ }
}

/** Settings > Privacy & Security > Location Services (default off). */
export function locationServicesEnabled(): boolean {
  try {
    return JSON.parse(localStorage.getItem('dex-settings') || '{}').locationServices === true;
  } catch {
    return false;
  }
}

function toast(type: 'success' | 'error' | 'info', message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* noop */ }
}

// Great-circle (haversine) distance between two coordinates, in kilometres.
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371; // mean Earth radius, km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const fmtCoord = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

// Geocode a place name via Open-Meteo (free, no API key). A failed request is
// reported as an error, never as "no places found".
export interface GeocodeOutcome { results: GeoResult[]; error: null | 'offline' | 'service' }
export const geocode = async (q: string, fetcher: typeof fetch = fetch): Promise<GeocodeOutcome> => {
  if (!q.trim()) return { results: [], error: null };
  try {
    const res = await fetcher(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`);
    if (!res.ok) return { results: [], error: 'service' };
    const data = await res.json();
    if (!Array.isArray(data?.results)) return { results: [], error: null };
    const results = data.results
      .filter((r: any) => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude) && typeof r?.name === 'string')
      .map((r: any): GeoResult => ({
        name: r.name,
        lat: r.latitude,
        lon: r.longitude,
        detail: [r.admin1, r.country].filter(Boolean).join(', '),
      }));
    return { results, error: null };
  } catch (err) {
    console.warn('[Maps] Geocode failed:', err);
    return { results: [], error: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'service' };
  }
};

/** User-facing reason for a geolocation failure (GeolocationPositionError codes). */
export function locationErrorMessage(code: number): string {
  if (code === 1) return 'Location permission was denied. Allow location for DEX in Windows Settings > Privacy & security > Location.';
  if (code === 3) return 'Finding your location took too long. Try again.';
  return 'Your location is not available right now.';
}

const ctrlBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)', cursor: 'pointer', padding: 0,
  transition: 'background 0.12s ease, color 0.12s ease',
};

// Scoped polish: crisp hover transitions and a subtle press
// for the action buttons inside cards/drawers. Mirrors this file's inline
// language (DEX tokens, hairline chrome) so nothing leaks to other apps.
const MAPS_STYLE = `
.dex-maps-root button { transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease, transform 0.08s ease; }
.dex-maps-root .dex-maps-card-btn:hover { background: var(--color-bg-hover) !important; border-color: var(--color-border-strong, var(--color-border)) !important; }
.dex-maps-root .dex-maps-card-btn:active { transform: scale(0.97); }
.dex-maps-root .dex-maps-iconbtn:hover { background: var(--color-bg-hover) !important; color: var(--color-text-primary) !important; border-radius: 8px; }
.dex-maps-root .dex-maps-result { transition: background 0.1s ease; }
.dex-maps-pulse { animation: dexMapsPulse 1.4s ease-in-out infinite; }
@keyframes dexMapsPulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
.dex-maps-card-enter { animation: dexMapsCardIn 0.18s ease both; }
@keyframes dexMapsCardIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
`;

// Floating popovers / drawers over the map. The translucent material + blur +
// rim come from `.dex-liquid-glass-strong` (applied via className on each
// consumer); only the layout/shape stays inline here.
const panel: React.CSSProperties = {
  borderRadius: 'var(--radius-lg)', overflow: 'hidden',
};

const rowBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
  padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--color-text-primary)', fontSize: 13,
};

// Shared "card action" button (Copy / Save / Notes / Reset) — one source of truth
// so the in-card controls stay pixel-identical and pick up the hover/active polish.
const cardBtn: React.CSSProperties = {
  flex: 1, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  background: 'var(--color-bg-base)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', color: 'var(--color-text-secondary)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

type Pin = { lat: number; lon: number };

const DexMaps: React.FC = () => {
  useAppTracking('maps');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const measureMarkersRef = useRef<maplibregl.Marker[]>([]);
  const measureLineId = 'dex-measure-line';
  const [styleKey, setStyleKey] = useState<StyleKey>('liberty');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Live verb for the place-search status ("Searching / Scanning / Hunting…").
  const searchPhrase = useWorkingPhrase(searching, 'search');
  const [place, setPlace] = useState('San Francisco');
  const [failed, setFailed] = useState(false);
  // First paint of the basemap can take a few seconds (style + tiles over the
  // network); show that instead of a blank canvas.
  const [mapReady, setMapReady] = useState(false);
  const [searchError, setSearchError] = useState<GeocodeOutcome['error']>(null);
  /** Base-map tiles failing to load (offline, provider down): shown, not just logged. */
  const [tilesFailing, setTilesFailing] = useState(false);

  const [recent, setRecent] = useState<GeoResult[]>(() => loadList<GeoResult>(RECENT_KEY));
  const [saved, setSaved] = useState<SavedPlace[]>(() => loadList<SavedPlace>(SAVED_KEY));
  const [focused, setFocused] = useState(false);

  // Current dropped pin (for copy / save / send-to-notes), and the latest goTo target.
  const [pin, setPin] = useState<{ lat: number; lon: number; name: string; detail: string } | null>(null);

  // Distance measuring: collect up to two points.
  const [measuring, setMeasuring] = useState(false);
  const [measurePts, setMeasurePts] = useState<Pin[]>([]);

  // Which side panel is open.
  const [drawer, setDrawer] = useState<null | 'saved' | 'measure'>(null);

  // -- persistence ------------------------------------------------------------
  useEffect(() => { saveList(RECENT_KEY, recent); }, [recent]);
  useEffect(() => { saveList(SAVED_KEY, saved); }, [saved]);

  const pushRecent = useCallback((r: GeoResult) => {
    setRecent((prev) => {
      const next = [r, ...prev.filter((p) => !(p.lat === r.lat && p.lon === r.lon))].slice(0, 8);
      return next;
    });
  }, []);

  // Fly to a coordinate and drop / move the marker.
  const goTo = useCallback((lat: number, lon: number, label: string, zoom = 12, detail = '') => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [lon, lat], zoom, essential: true });
    if (markerRef.current) {
      markerRef.current.setLngLat([lon, lat]);
    } else {
      markerRef.current = new maplibregl.Marker({ color: canvasColor('--color-accent') }).setLngLat([lon, lat]).addTo(map);
    }
    setPlace(label);
    setPin({ lat, lon, name: label, detail });
  }, []);

  const isSaved = useCallback(
    (lat: number, lon: number) => saved.some((s) => Math.abs(s.lat - lat) < 1e-6 && Math.abs(s.lon - lon) < 1e-6),
    [saved],
  );

  const toggleSaved = useCallback((p: { name: string; detail: string; lat: number; lon: number }) => {
    setSaved((prev) => {
      const exists = prev.some((s) => Math.abs(s.lat - p.lat) < 1e-6 && Math.abs(s.lon - p.lon) < 1e-6);
      if (exists) {
        toast('info', 'Removed from saved places');
        return prev.filter((s) => !(Math.abs(s.lat - p.lat) < 1e-6 && Math.abs(s.lon - p.lon) < 1e-6));
      }
      toast('success', `Saved ${p.name}`);
      return [{ name: p.name, detail: p.detail, lat: p.lat, lon: p.lon }, ...prev].slice(0, 50);
    });
  }, []);

  // -- measure mode -----------------------------------------------------------
  const clearMeasure = useCallback(() => {
    measureMarkersRef.current.forEach((m) => m.remove());
    measureMarkersRef.current = [];
    setMeasurePts([]);
    const map = mapRef.current;
    if (map) {
      try {
        if (map.getLayer(measureLineId)) map.removeLayer(measureLineId);
        if (map.getSource(measureLineId)) map.removeSource(measureLineId);
      } catch { /* style not ready */ }
    }
  }, []);

  const addMeasurePoint = useCallback((lat: number, lon: number) => {
    const map = mapRef.current;
    if (!map) return;
    setMeasurePts((prev) => {
      // After two points, a new click starts a fresh measurement.
      let pts = prev.length >= 2 ? [] : prev.slice();
      if (pts.length === 0) {
        measureMarkersRef.current.forEach((m) => m.remove());
        measureMarkersRef.current = [];
        try {
          if (map.getLayer(measureLineId)) map.removeLayer(measureLineId);
          if (map.getSource(measureLineId)) map.removeSource(measureLineId);
        } catch { /* noop */ }
      }
      pts = [...pts, { lat, lon }];
      const mk = new maplibregl.Marker({ color: pts.length === 1 ? canvasColor('--color-accent') : canvasColor('--color-text-secondary') })
        .setLngLat([lon, lat]).addTo(map);
      measureMarkersRef.current.push(mk);

      if (pts.length === 2) {
        const geo: GeoJSON.Feature = {
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) },
        };
        try {
          if (map.getSource(measureLineId)) {
            (map.getSource(measureLineId) as maplibregl.GeoJSONSource).setData(geo as any);
          } else {
            map.addSource(measureLineId, { type: 'geojson', data: geo as any });
            map.addLayer({
              id: measureLineId, type: 'line', source: measureLineId,
              paint: { 'line-color': canvasColor('--color-accent'), 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
            });
          }
          map.fitBounds([[pts[0].lon, pts[0].lat], [pts[1].lon, pts[1].lat]], { padding: 120, maxZoom: 12, duration: 600 });
        } catch { /* style swapping -- ignore */ }
      }
      return pts;
    });
  }, []);

  // Add a saved place as a measure endpoint.
  const measureFromSaved = useCallback((s: SavedPlace) => {
    setMeasuring(true);
    setDrawer('measure');
    addMeasurePoint(s.lat, s.lon);
  }, [addMeasurePoint]);

  const distanceKm = measurePts.length === 2 ? haversineKm(measurePts[0], measurePts[1]) : null;

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLES[styleKey].style as any,
        center: [-122.4194, 37.7749],
        zoom: 11,
      });
    } catch (err) {
      console.warn('[Maps] Map init failed:', err);
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.once('idle', () => setMapReady(true));
    map.on('error', (e) => {
      console.warn('[Maps] map error:', e?.error?.message || e);
      if ((e as { tile?: unknown; sourceId?: string }).tile || (e as { sourceId?: string }).sourceId || /fetch|network|load/i.test(String(e?.error?.message ?? ''))) {
        lastTileError = Date.now();
        setTilesFailing(true);
      }
    });
    // Clear once tiles load again well after the last failure (not on 'idle',
    // which also fires when every pending tile has simply failed).
    let lastTileError = 0;
    map.on('data', (e) => {
      if ((e as { tile?: unknown }).tile && lastTileError && Date.now() - lastTileError > 3000) { lastTileError = 0; setTilesFailing(false); }
    });
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; measureMarkersRef.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map click: in measure mode collect points; otherwise drop a pin.
  const measuringRef = useRef(measuring);
  measuringRef.current = measuring;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      if (measuringRef.current) {
        addMeasurePoint(lat, lng);
        return;
      }
      if (markerRef.current) markerRef.current.setLngLat([lng, lat]);
      else markerRef.current = new maplibregl.Marker({ color: canvasColor('--color-accent') }).setLngLat([lng, lat]).addTo(map);
      const label = `Pin ${fmtCoord(lat, lng)}`;
      setPin({ lat, lon: lng, name: label, detail: '' });
      setPlace(label);
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMeasurePoint]);

  // Swap the basemap style when toggled (preserves camera; redraws measure line).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[styleKey].style as any);
    // Re-add the measure line once the new style finishes loading.
    if (measurePts.length === 2) {
      const pts = measurePts;
      const onLoad = () => {
        try {
          const geo: GeoJSON.Feature = {
            type: 'Feature', properties: {},
            geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) },
          };
          if (!map.getSource(measureLineId)) {
            map.addSource(measureLineId, { type: 'geojson', data: geo as any });
            map.addLayer({
              id: measureLineId, type: 'line', source: measureLineId,
              paint: { 'line-color': canvasColor('--color-accent'), 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
            });
          }
        } catch { /* noop */ }
      };
      map.once('styledata', onLoad);
      // If the style is swapped again before `styledata` fires, drop the stale
      // one-shot listener so it can't run against a torn-down/different style.
      return () => { try { map.off('styledata', onLoad); } catch { /* noop */ } };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]);

  // UKI-driven navigation: assistant dispatches `dex-maps-goto`.
  useEffect(() => {
    const onGoto = async (e: Event) => {
      try {
        const d = (e as CustomEvent).detail || {};
        if (typeof d.lat === 'number' && typeof d.lon === 'number') {
          goTo(d.lat, d.lon, d.label || 'Location', d.zoom ?? 12);
        } else if (typeof d.query === 'string') {
          const { results: hits, error } = await geocode(d.query);
          if (hits[0]) goTo(hits[0].lat, hits[0].lon, hits[0].name, 12, hits[0].detail);
          else toast(error ? 'error' : 'info', error ? 'Place search is unavailable. Check your connection.' : `No place found for "${d.query}".`);
        }
      } catch (err) { console.warn('[Maps] goto failed:', err); }
    };
    window.addEventListener('dex-maps-goto', onGoto as EventListener);
    return () => window.removeEventListener('dex-maps-goto', onGoto as EventListener);
  }, [goTo]);

  // UKI app-context: expose the centered place / dropped-pin coordinates and the
  // count of saved places so the assistant knows what the map is showing. A ref
  // keeps the resolver reading live state — register once at mount.
  const ukiCtxRef = useRef({ place, pin, savedCount: saved.length, styleKey });
  ukiCtxRef.current = { place, pin, savedCount: saved.length, styleKey };
  useEffect(() => {
    registerUkiAppContext('maps', () => {
      const s = ukiCtxRef.current;
      return {
        appId: 'maps',
        focusedItemId: s.place,
        custom: {
          centeredOn: s.place,
          coordinates: s.pin ? fmtCoord(s.pin.lat, s.pin.lon) : undefined,
          savedPlaces: s.savedCount,
          basemap: MAP_STYLES[s.styleKey]?.label,
        },
      };
    });
    return () => unregisterUkiAppContext('maps');
  }, []);

  // Debounced search-as-you-type.
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { results: hits, error } = await geocode(query);
      if (!cancelled) { setResults(hits); setSearchError(error); setSearching(false); }
    }, 320);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const pick = useCallback((r: GeoResult) => {
    goTo(r.lat, r.lon, r.name, 12, r.detail);
    pushRecent(r);
    setQuery('');
    setResults([]);
    setFocused(false);
  }, [goTo, pushRecent]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { toast('info', 'Location is not available on this device.'); return; }
    // Honor Settings > Privacy & Security > Location Services (off by default).
    // It used to be ignored: "My location" read the position regardless.
    if (!locationServicesEnabled()) {
      toast('info', 'Location Services is off. Turn it on in Settings > Privacy & Security to use My location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => goTo(pos.coords.latitude, pos.coords.longitude, 'My location', 14),
      (err) => { console.warn('[Maps] geolocation failed:', err.message); toast('error', locationErrorMessage(err.code)); },
      { timeout: 15000, maximumAge: 60000 },
    );
  }, [goTo]);

  // Copy current pin coordinates to clipboard (guarded).
  const copyPin = useCallback(async () => {
    if (!pin) return;
    try {
      await navigator.clipboard?.writeText(fmtCoord(pin.lat, pin.lon));
      toast('success', 'Coordinates copied');
    } catch {
      toast('error', 'Could not copy coordinates');
    }
  }, [pin]);

  // Send current pin to Notes.
  const sendPinToNotes = useCallback(async () => {
    if (!pin) return;
    const lines = [
      pin.name,
      pin.detail,
      `Coordinates: ${fmtCoord(pin.lat, pin.lon)}`,
      `https://www.openstreetmap.org/?mlat=${pin.lat}&mlon=${pin.lon}#map=13/${pin.lat}/${pin.lon}`,
    ].filter(Boolean);
    await sendToNotes(lines.join('\n'), pin.name);
  }, [pin]);

  const cycleStyle = useCallback(() => {
    setStyleKey((k) => {
      const i = STYLE_ORDER.indexOf(k);
      return STYLE_ORDER[(i + 1) % STYLE_ORDER.length];
    });
  }, []);

  const nextStyle = STYLE_ORDER[(STYLE_ORDER.indexOf(styleKey) + 1) % STYLE_ORDER.length];
  const showRecentPanel = focused && !query.trim() && recent.length > 0;

  if (failed) {
    return <AppErrorState title="Maps unavailable" description="The map engine could not start on this device." icon="map-pin" />;
  }

  return (
    <div className="dex-maps-root" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--color-bg-base)' }}>
      <style>{MAPS_STYLE}</style>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {!mapReady && (
        <div role="status" aria-live="polite" style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-bg-base)', color: 'var(--color-text-secondary)', fontSize: 13, pointerEvents: 'none',
        }}>
          Loading map…
        </div>
      )}
      {tilesFailing && (
        <div role="status" className="dex-liquid-glass-strong" style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 6, padding: '8px 12px', ...panel, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 'calc(100% - 32px)' }}>
          <DexIcon name="alert-triangle" size={14} color="var(--color-text-tertiary)" />
          Some map tiles could not load. Check your connection.
        </div>
      )}

      {/* Mirror current view for UKI screen-context. */}
      <span data-app-content style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        DEX Maps centered on {place}
      </span>

      {/* Search */}
      <div
        style={{ position: 'absolute', top: 12, left: 12, width: 'min(320px, calc(100% - 24px))', zIndex: 6 }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}
      >
        <DexSearchInput
          fullWidth
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => { setQuery(''); setResults([]); }}
          loading={searching}
          placeholder="Search places"
          aria-label="Search places"
        />
        {results.length > 0 && (
          <div role="listbox" aria-label="Search results" className="dex-liquid-glass-strong dex-maps-card-enter" style={{ ...panel, marginTop: 6 }}>
            {results.map((r, i) => (
              <div key={`${r.lat},${r.lon},${i}`} role="option" aria-selected={false} className="dex-hover-bg dex-maps-result"
                style={{ display: 'flex', alignItems: 'center', borderTop: i ? '1px solid var(--color-border)' : 'none' }}>
                <button onClick={() => pick(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, textAlign: 'left',
                    padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <DexIcon name="map-pin" size={14} color="var(--color-text-tertiary)" />
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{r.name}</span>
                    {r.detail && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{r.detail}</span>}
                  </span>
                </button>
                <button aria-label={isSaved(r.lat, r.lon) ? 'Remove from saved' : 'Save place'} title={isSaved(r.lat, r.lon) ? 'Remove from saved' : 'Save place'}
                  className="dex-maps-iconbtn"
                  onMouseDown={(e) => { e.preventDefault(); toggleSaved(r); }}
                  style={{ width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: isSaved(r.lat, r.lon) ? '#FFD60A' : 'var(--color-text-tertiary)' }}>
                  <DexIcon name={isSaved(r.lat, r.lon) ? 'star' : 'star-outline'} size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {showRecentPanel && (
          <div role="listbox" aria-label="Recent searches" className="dex-liquid-glass-strong dex-maps-card-enter" style={{ ...panel, marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'none', letterSpacing: 0.4 }}>Recent</span>
              <button onMouseDown={(e) => { e.preventDefault(); setRecent([]); }} className="dex-maps-iconbtn" style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '2px 6px' }}>Clear</button>
            </div>
            {recent.map((r, i) => (
              <button key={`rec-${r.lat},${r.lon},${i}`} role="option" aria-selected={false} className="dex-hover-bg dex-maps-result"
                onMouseDown={(e) => { e.preventDefault(); pick(r); }} style={{ ...rowBtn, borderTop: i ? '1px solid var(--color-border)' : 'none' }}>
                <DexIcon name="clock" size={14} color="var(--color-text-tertiary)" />
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{r.name}</span>
                  {r.detail && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{r.detail}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
        {query.trim() && searching && results.length === 0 && (
          <div role="status" aria-label="Searching" className="dex-liquid-glass-strong dex-maps-card-enter" style={{ marginTop: 6, padding: '10px 12px', ...panel, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            <span className="dex-maps-pulse" style={{ display: 'flex' }}><DexIcon name="search" size={14} color="var(--color-text-tertiary)" /></span>
            {searchPhrase} places…
          </div>
        )}
        {query.trim() && !searching && results.length === 0 && searchError && (
          <div role="alert" className="dex-liquid-glass-strong dex-maps-card-enter" style={{ marginTop: 6, padding: '14px 12px', ...panel, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            <DexIcon name="alert-triangle" size={20} color="var(--color-text-tertiary)" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{searchError === 'offline' ? 'You are offline' : 'Place search is unavailable'}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{searchError === 'offline' ? 'Connect to the internet to search for places.' : 'The search service did not respond. Try again in a moment.'}</span>
          </div>
        )}
        {query.trim() && !searching && results.length === 0 && !searchError && (
          <div role="status" className="dex-liquid-glass-strong dex-maps-card-enter" style={{ marginTop: 6, padding: '14px 12px', ...panel, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            <DexIcon name="map-pin" size={20} color="var(--color-text-tertiary)" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>No places found</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Try a city, landmark, or address.</span>
          </div>
        )}
      </div>

      {/* Top-right action cluster: saved places + measure toggles */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 6 }}>
        <button aria-label="Saved places" title="Saved places"
          onClick={() => setDrawer((d) => (d === 'saved' ? null : 'saved'))}
          style={{ ...ctrlBtn, width: 'auto', padding: '0 12px', gap: 6, borderRadius: 10, background: drawer === 'saved' ? 'var(--color-bg-hover)' : 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600 }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = drawer === 'saved' ? 'var(--color-bg-hover)' : 'var(--color-bg-elevated)'}>
          <DexIcon name="star" size={14} color="#FFD60A" />
          Saved{saved.length ? ` (${saved.length})` : ''}
        </button>
        <button aria-label="Measure distance" title="Measure distance between two points"
          onClick={() => {
            setMeasuring((m) => {
              const next = !m;
              if (next) { setDrawer('measure'); } else { setDrawer((d) => (d === 'measure' ? null : d)); clearMeasure(); }
              return next;
            });
          }}
          style={{ ...ctrlBtn, width: 'auto', padding: '0 12px', gap: 6, borderRadius: 10, background: measuring ? 'var(--color-accent-primary)' : 'var(--color-bg-elevated)', color: measuring ? '#fff' : 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600 }}
          onMouseEnter={e => { if (!measuring) e.currentTarget.style.background = 'var(--color-bg-hover)'; }} onMouseLeave={e => { if (!measuring) e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}>
          <DexIcon name="crosshair" size={14} />
          Measure
        </button>
      </div>

      {/* Saved places drawer */}
      {drawer === 'saved' && (
        <div className="dex-liquid-glass-strong dex-maps-card-enter" style={{ position: 'absolute', top: 56, right: 12, width: 'min(280px, calc(100% - 24px))', maxHeight: 'calc(100% - 120px)', display: 'flex', flexDirection: 'column', ...panel, zIndex: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Saved places{saved.length ? ` · ${saved.length}` : ''}</span>
            <button aria-label="Close" className="dex-maps-iconbtn" onClick={() => setDrawer(null)} style={{ width: 24, height: 24, background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DexIcon name="close" size={15} />
            </button>
          </div>
          <div style={{ overflowY: 'auto' }}>
            {saved.length === 0 && (
              <div style={{ padding: '22px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
                <DexIcon name="star-outline" size={22} color="var(--color-text-tertiary)" />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>No saved places yet</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>Star a search result or a dropped pin to keep it here.</span>
              </div>
            )}
            {saved.map((s, i) => (
              <div key={`saved-${s.lat},${s.lon},${i}`} className="dex-hover-bg dex-maps-result" style={{ display: 'flex', alignItems: 'center', borderTop: i ? '1px solid var(--color-border)' : 'none' }}>
                <button onClick={() => { goTo(s.lat, s.lon, s.name, 12, s.detail); }} style={{ ...rowBtn, flex: 1, minWidth: 0 }}>
                  <DexIcon name="map-pin" size={14} color="var(--color-text-tertiary)" />
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{s.name}</span>
                    {s.detail && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{s.detail}</span>}
                  </span>
                </button>
                <button aria-label="Use in distance measurement" title="Use in distance measurement" className="dex-maps-iconbtn" onClick={() => measureFromSaved(s)}
                  style={{ width: 30, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>
                  <DexIcon name="crosshair" size={14} />
                </button>
                <button aria-label="Remove saved place" title="Remove" className="dex-maps-iconbtn" onClick={() => toggleSaved(s)}
                  style={{ width: 32, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>
                  <DexIcon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Measure drawer */}
      {drawer === 'measure' && (
        <div className="dex-liquid-glass-strong" style={{ position: 'absolute', top: 56, right: 12, width: 'min(280px, calc(100% - 24px))', ...panel, zIndex: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Distance</span>
            <button aria-label="Close" onClick={() => { setDrawer(null); setMeasuring(false); clearMeasure(); }} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <DexIcon name="close" size={15} />
            </button>
          </div>
          <div style={{ padding: '12px' }}>
            {measurePts.length < 2 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                {measuring ? 'Click two points on the map' : 'Turn on Measure, then click two points'} — or pick saved places using the crosshair button.
                {measurePts.length === 1 && <div style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>First point set. Choose a second.</div>}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>{(distanceKm ?? 0).toFixed(1)}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>km</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{((distanceKm ?? 0) * 0.621371).toFixed(1)} mi</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
                  A: {fmtCoord(measurePts[0].lat, measurePts[0].lon)}<br />
                  B: {fmtCoord(measurePts[1].lat, measurePts[1].lon)}
                </div>
              </>
            )}
            {measurePts.length > 0 && (
              <button onClick={clearMeasure} style={{ marginTop: 12, width: '100%', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <DexIcon name="refresh" size={13} /> Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pin info card (coords + copy / save / send-to-notes) */}
      {pin && !measuring && (
        <div className="dex-liquid-glass-strong" style={{ position: 'absolute', left: 12, bottom: 72, width: 'min(300px, calc(100% - 24px))', ...panel, zIndex: 6 }}>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pin.name}</div>
                {pin.detail && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{pin.detail}</div>}
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{fmtCoord(pin.lat, pin.lon)}</div>
              </div>
              <button aria-label="Dismiss pin" onClick={() => setPin(null)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <DexIcon name="close" size={15} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button onClick={copyPin} title="Copy coordinates" style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <DexIcon name="copy" size={13} /> Copy
              </button>
              <button onClick={() => toggleSaved(pin)} title={isSaved(pin.lat, pin.lon) ? 'Remove from saved' : 'Save place'} style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', color: isSaved(pin.lat, pin.lon) ? '#FFD60A' : 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <DexIcon name={isSaved(pin.lat, pin.lon) ? 'star' : 'star-outline'} size={13} /> {isSaved(pin.lat, pin.lon) ? 'Saved' : 'Save'}
              </button>
              <button onClick={sendPinToNotes} title="Send location to Notes" style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <DexIcon name="send" size={13} /> Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vertical control stack (custom, DEX-styled) */}
      <div style={{ position: 'absolute', right: 12, bottom: 28, display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--color-border)', zIndex: 5 }}>
        <button aria-label="Zoom in" title="Zoom in" style={{ ...ctrlBtn, borderWidth: 0, borderBottom: '1px solid var(--color-border)' }}
          onClick={() => mapRef.current?.zoomIn()} onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}>
          <DexIcon name="plus" size={16} />
        </button>
        <button aria-label="Zoom out" title="Zoom out" style={{ ...ctrlBtn, borderWidth: 0, borderBottom: '1px solid var(--color-border)' }}
          onClick={() => mapRef.current?.zoomOut()} onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}>
          <DexIcon name="minus" size={16} />
        </button>
        <button aria-label="My location" title="My location" style={{ ...ctrlBtn, borderWidth: 0 }}
          onClick={locate} onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}>
          <DexIcon name="navigation" size={15} />
        </button>
      </div>

      {/* Basemap style toggle (cycles streets -> satellite -> terrain) */}
      <button aria-label={`Switch to ${MAP_STYLES[nextStyle].label} basemap`}
        title={`Switch to ${MAP_STYLES[nextStyle].label} basemap`}
        onClick={cycleStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
        style={{ position: 'absolute', left: 12, bottom: 28, height: 34, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 10,
          color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background 0.12s ease', zIndex: 5 }}>
        <DexIcon name={MAP_STYLES[styleKey].icon} size={14} />
        {MAP_STYLES[styleKey].label}
      </button>
    </div>
  );
};

export default memo(DexMaps);
