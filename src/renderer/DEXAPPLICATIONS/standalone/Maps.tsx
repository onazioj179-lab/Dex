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
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { SegmentedControl } from '../../components/controls';
import { isReduceMotion } from '../../utils/MotionController';
// maplibre-gl 6 ships ESM named exports only (no default).
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre 6 loads its tile worker from a separate module next to its own file,
// which does not exist once Vite bundles it ("Worker failed to load", blank
// map). Point it at the worker Vite emits as an asset (same origin: CSP-safe).
// Production only: the dev server rewrites that file for the window (it injects
// its client and a 4.5 MB inline source map), so the worker never answered and
// the map hung on "Loading map"; in dev maplibre's own resolution works.
// Dev: neither works (maplibre's own lookup 404s on the pre-bundled copy; the
// served file gets the dev client injected and hangs), so the raw source runs
// from a Blob URL (CSP worker-src allows blob:). The map waits for this.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
const workerReady: Promise<void> = import.meta.env.PROD
  ? Promise.resolve(maplibregl.setWorkerUrl?.(maplibreWorkerUrl))
  : import.meta.env.MODE === 'test'
    ? Promise.resolve() // unit tests mock the map; no worker runs
    : import('maplibre-gl/dist/maplibre-gl-worker.mjs?raw')
    .then((m) => { maplibregl.setWorkerUrl?.(URL.createObjectURL(new Blob([m.default], { type: 'text/javascript' }))); })
    .catch(() => undefined);
import DexIcon from '../../components/DexIcon';
import { canvasColor } from '../../utils/canvasTheme';
import { DexSearchInput } from '../../styles/components';
import { WindowToolbar, useUnifiedChrome } from '../../shell/windowChrome';
import { searchPlaces, reversePlace, type Place } from './mapsServices';
import { MapsDirections } from './MapsDirections';
import { parseCoordinates, formatCoordinates, parseTrackFile, trackLengthKm, trackBounds, toGpx, type TrackData } from './mapsTracks';
import { downloadText } from '../../improvements500/downloadBlob';
import { AppErrorState } from '../../ui/AppStates';
import { useAppTracking } from '../../services/usePatternLearning';
import { sendToNotes } from '../../services/sendTo';
import { sendCreativeInput } from '../../services/creativeIntake';
import { openCalendarDraft } from '../../services/calendarDraft';
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

// -- Last view: the map reopens where you left it (centre, zoom, rotation,
//    tilt, basemap). Pure parse so a corrupt value falls back cleanly.
const VIEW_KEY = 'dex-maps-view';
export interface MapView { center: [number, number]; zoom: number; bearing: number; pitch: number; style?: string }
export function parseMapView(raw: string | null): MapView | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    const [lng, lat] = Array.isArray(v?.center) ? v.center : [];
    if (![lng, lat, v?.zoom].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {
      center: [lng, lat], zoom: Math.min(22, Math.max(0, v.zoom)),
      bearing: Number.isFinite(v.bearing) ? v.bearing : 0,
      pitch: Number.isFinite(v.pitch) ? Math.min(85, Math.max(0, v.pitch)) : 0,
      style: typeof v.style === 'string' ? v.style : undefined,
    };
  } catch { return null; }
}

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
export const geocode = async (q: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<GeocodeOutcome> => {
  if (!q.trim()) return { results: [], error: null };
  try {
    const res = await fetcher(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`, { signal });
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
    if (signal?.aborted) return { results: [], error: null };
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

// Map controls sit on the shared frosted material (.dex-mat-frosted on their
// group), so the buttons themselves are transparent.
/** Floating glass pill for controls over the map (one material across DEX). */
const glassPill: React.CSSProperties = {
  height: 34, padding: '0 14px', gap: 6, borderRadius: 9999, display: 'flex', alignItems: 'center',
  background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--glass-edge)', boxShadow: 'var(--glass-shadow), var(--glass-rim)',
  color: 'var(--color-text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

/** The same controls when they sit in the window bar: flat, compact pills. */
const barPill: React.CSSProperties = {
  height: 26, padding: '0 10px', gap: 6, borderRadius: 9999, display: 'flex', alignItems: 'center', flexShrink: 0,
  background: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

const ctrlBtn: React.CSSProperties = {
  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid transparent',
  color: 'var(--color-text-primary)', cursor: 'pointer', padding: 0,
  transition: 'background 0.12s ease, color 0.12s ease',
};

// Scoped polish: crisp hover transitions and a subtle press
// for the action buttons inside cards/drawers. Mirrors this file's inline
// language (DEX tokens, hairline chrome) so nothing leaks to other apps.
const MAPS_STYLE = `
.dex-maps-root button { transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease; }
.dex-maps-root .dex-maps-card-btn:hover { background: var(--color-bg-hover) !important; border-color: var(--color-border-strong, var(--color-border)) !important; }
.dex-maps-root .dex-maps-iconbtn:hover { background: var(--color-bg-hover) !important; color: var(--color-text-primary) !important; border-radius: var(--radius-sm); }
.dex-maps-root .dex-maps-result { transition: background 0.1s ease; }
.dex-maps-pulse { animation: dexMapsPulse 1.4s ease-in-out infinite; }
@keyframes dexMapsPulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
.dex-maps-card-enter { animation: dexMapsCardIn 0.18s ease both; }
@keyframes dexMapsCardIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
`;

const panel: React.CSSProperties = {
  borderRadius: 'var(--radius-md)', overflow: 'hidden',
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
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
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
  const savedView = useMemo(() => { try { return parseMapView(localStorage.getItem(VIEW_KEY)); } catch { return null; } }, []);
  const [styleKey, setStyleKey] = useState<StyleKey>(() => (savedView?.style && savedView.style in MAP_STYLES ? savedView.style as StyleKey : 'liberty'));
  const styleKeyRef = useRef(styleKey);
  styleKeyRef.current = styleKey;
  const [bearing, setBearing] = useState(savedView?.bearing ?? 0);
  const [pitch, setPitch] = useState(savedView?.pitch ?? 0);
  const [query, setQuery] = useState('');
  const [settledSearch, setSettledSearch] = useState<(GeocodeOutcome & { query: string }) | null>(null);
  const searchQuery = query.trim();
  const currentSearch = settledSearch?.query === searchQuery ? settledSearch : null;
  const results = currentSearch?.results ?? [];
  const searching = !!searchQuery && !currentSearch;
  const searchError = currentSearch?.error;
  const [place, setPlace] = useState('San Francisco');
  const [failed, setFailed] = useState(false);
  // First paint of the basemap can take a few seconds (style + tiles over the
  // network); show that instead of a blank canvas.
  const [mapReady, setMapReady] = useState(false);
  /** Base-map tiles failing to load (offline, provider down): shown, not just logged. */
  const [tilesFailing, setTilesFailing] = useState(false);

  const [recent, setRecent] = useState<GeoResult[]>(() => loadList<GeoResult>(RECENT_KEY));
  const [saved, setSaved] = useState<SavedPlace[]>(() => loadList<SavedPlace>(SAVED_KEY));
  const [focused, setFocused] = useState(false);

  // Current dropped pin (for copy / save / send-to-notes), and the latest goTo target.
  const [pin, setPin] = useState<{ lat: number; lon: number; name: string; detail: string } | null>(null);
  // An opened GPX / KML / GeoJSON file, drawn over the map.
  const [track, setTrack] = useState<TrackData | null>(null);
  const trackInputRef = useRef<HTMLInputElement>(null);
  const trackMarkersRef = useRef<maplibregl.Marker[]>([]);

  // Distance measuring uses a path of up to 32 points.
  const [measuring, setMeasuring] = useState(false);
  const [measurePts, setMeasurePts] = useState<Pin[]>([]);

  // Which side panel is open.
  const [drawer, setDrawer] = useState<null | 'saved' | 'measure' | 'directions'>(null);
  const [dirTo, setDirTo] = useState<Place | null>(null);

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
  const clearMeasure = useCallback(() => setMeasurePts([]), []);

  const addMeasurePoint = useCallback((lat: number, lon: number) => {
    setMeasurePts(points => points.length < 32 ? [...points, { lat, lon }] : points);
  }, []);

  // Add a saved place as a measure endpoint.
  const measureFromSaved = useCallback((s: SavedPlace) => {
    setMeasuring(true);
    setDrawer('measure');
    addMeasurePoint(s.lat, s.lon);
  }, [addMeasurePoint]);

  const distanceKm = measurePts.slice(1).reduce((total, point, i) => total + haversineKm(measurePts[i], point), 0);

  // Initialise the map once.
  const [workerSet, setWorkerSet] = useState(false);
  // The map is created asynchronously (after its worker URL), so effects that
  // attach to it re-run once it exists.
  const [mapLive, setMapLive] = useState(false);
  // Bumped by Retry: tears the map down and builds it again.
  const [mapGen, setMapGen] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => { let live = true; void workerReady.then(() => { if (live) setWorkerSet(true); }); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!workerSet || !containerRef.current || mapRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLES[styleKey].style as any,
        center: savedView?.center ?? [-122.4194, 37.7749],
        zoom: savedView?.zoom ?? 11,
        bearing: savedView?.bearing ?? 0,
        pitch: savedView?.pitch ?? 0,
      });
    } catch (err) {
      console.warn('[Maps] Map init failed:', err);
      setFailed(true);
      return;
    }
    mapRef.current = map;
    setMapLive(true);
    // Ready on whichever comes first ('idle' alone could be missed, leaving
    // "Loading map" forever); past 15 s offer Retry instead of a spinner.
    let ready = false;
    const markReady = () => { if (ready) return; ready = true; setMapReady(true); setSlowLoad(false); };
    map.once('load', markReady);
    map.once('idle', markReady);
    const slowTimer = setTimeout(() => { if (!ready) setSlowLoad(true); }, 15000);
    // Track rotation/tilt for the compass, and remember the view (debounced).
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    map.on('rotate', () => setBearing(map.getBearing()));
    map.on('pitch', () => setPitch(map.getPitch()));
    map.on('moveend', () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          const c = map.getCenter();
          localStorage.setItem(VIEW_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), style: styleKeyRef.current }));
        } catch { /* storage blocked */ }
      }, 400);
    });
    map.on('error', (e: maplibregl.ErrorEvent) => {
      console.warn('[Maps] map error:', e?.error?.message || e);
      if ((e as { tile?: unknown; sourceId?: string }).tile || (e as { sourceId?: string }).sourceId || /fetch|network|load/i.test(String(e?.error?.message ?? ''))) {
        lastTileError = Date.now();
        setTilesFailing(true);
      }
    });
    // Clear once tiles load again well after the last failure (not on 'idle',
    // which also fires when every pending tile has simply failed).
    let lastTileError = 0;
    map.on('data', (e: maplibregl.MapSourceDataEvent | maplibregl.MapStyleDataEvent) => {
      if ((e as { tile?: unknown }).tile && lastTileError && Date.now() - lastTileError > 3000) { lastTileError = 0; setTilesFailing(false); }
    });
    return () => { clearTimeout(slowTimer); map.remove(); mapRef.current = null; markerRef.current = null; measureMarkersRef.current = []; setMapLive(false); setMapReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerSet, mapGen]);

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
      // Name the pin by what is there (street address or place).
      reverseCtl?.abort();
      const ctl = new AbortController();
      reverseCtl = ctl;
      void reversePlace(lat, lng, fetch, ctl.signal).then(found => {
        if (!found || ctl.signal.aborted) return;
        setPin(prev => (prev && prev.lat === lat && prev.lon === lng ? { ...prev, name: found.name, detail: found.detail } : prev));
        setPlace(found.name);
      });
    };
    let reverseCtl: AbortController | null = null;
    map.on('click', onClick);
    return () => { map.off('click', onClick); reverseCtl?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMeasurePoint, mapLive]);

  useEffect(() => {
    mapRef.current?.setStyle(MAP_STYLES[styleKey].style);
  }, [styleKey]); // the map is created with the current style; only changes re-style it

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    measureMarkersRef.current.forEach(marker => marker.remove());
    measureMarkersRef.current = measurePts.map((point, i) => new maplibregl.Marker({
      color: canvasColor(i === 0 ? '--color-accent' : '--color-text-secondary'),
    }).setLngLat([point.lon, point.lat]).addTo(map));

    const draw = () => {
      const source = map.getSource<maplibregl.GeoJSONSource>(measureLineId);
      if (measurePts.length < 2) {
        if (map.getLayer(measureLineId)) map.removeLayer(measureLineId);
        if (source) map.removeSource(measureLineId);
        return;
      }
      const data: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: measurePts.map(point => [point.lon, point.lat]) },
      };
      if (source) source.setData(data);
      else {
        map.addSource(measureLineId, { type: 'geojson', data });
        map.addLayer({
          id: measureLineId, type: 'line', source: measureLineId,
          paint: { 'line-color': canvasColor('--color-accent'), 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
        });
      }
    };
    if (map.isStyleLoaded() || map.getSource(measureLineId)) draw();
    else map.once('idle', draw);
    map.on('style.load', draw);
    return () => { map.off('style.load', draw); map.off('idle', draw); };
  }, [measurePts, styleKey, mapLive]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const SRC = 'dex-track';
    const draw = () => {
      // Tiles still loading: try again when the map settles (as the measure line does).
      if (!map.isStyleLoaded()) { map.once('idle', draw); return; }
      if (map.getLayer(SRC)) map.removeLayer(SRC);
      if (map.getSource(SRC)) map.removeSource(SRC);
      if (!track) return;
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: track.lines.map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } })) } });
      map.addLayer({ id: SRC, type: 'line', source: SRC, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': canvasColor('--color-accent'), 'line-width': 4, 'line-opacity': 0.9 } });
    };
    for (const m of trackMarkersRef.current) m.remove();
    trackMarkersRef.current = (track?.points ?? []).slice(0, 300).map((p) => {
      const el = document.createElement('div');
      el.style.cssText = 'width:10px;height:10px;border-radius:50%;background:var(--color-accent);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)';
      el.setAttribute('aria-label', p.name);
      return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).setPopup(new maplibregl.Popup({ offset: 10, closeButton: false }).setText(p.name)).addTo(map);
    });
    draw();
    map.on('style.load', draw);
    return () => { map.off('style.load', draw); map.off('idle', draw); };
  }, [track]);

  // Cancel request work on query changes and ignore late responses.
  useEffect(() => {
    if (!searchQuery) return;
    const coord = parseCoordinates(searchQuery);
    if (coord) {
      setSettledSearch({ query: searchQuery, results: [{ name: formatCoordinates(coord), detail: 'Coordinates', lat: coord.lat, lon: coord.lon }], error: null });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      // Photon knows addresses, streets, landmarks and businesses (ranked near
      // the map view); Open-Meteo (city names only) is the fallback.
      let c: { lat: number; lng: number } | undefined;
      try { c = mapRef.current?.getCenter(); } catch { c = undefined; }
      let outcome = await searchPlaces(searchQuery, fetch, controller.signal, c ? { lat: c.lat, lon: c.lng } : undefined);
      if (outcome.error === 'service' && !controller.signal.aborted) {
        const fallback = await geocode(searchQuery, fetch, controller.signal);
        if (!fallback.error) outcome = fallback;
      }
      if (!controller.signal.aborted) setSettledSearch({ query: searchQuery, ...outcome });
    }, 320);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchQuery]);

  const changeSearch = (value: string) => {
    if (value.trim() !== searchQuery) setSettledSearch(null);
    setQuery(value);
  };

  const pick = useCallback((r: GeoResult) => {
    goTo(r.lat, r.lon, r.name, 12, r.detail);
    pushRecent(r);
    setQuery('');
    setSettledSearch(null);
    setFocused(false);
  }, [goTo, pushRecent]);

  // The device position as a Place, or null (with a toast saying why).
  const myLocation = useCallback((): Promise<Place | null> => new Promise(resolve => {
    if (!navigator.geolocation) { toast('info', 'Location is not available on this device.'); resolve(null); return; }
    // Honor Settings > Privacy & Security > Location Services (off by default).
    if (!locationServicesEnabled()) {
      toast('info', 'Location Services is off. Turn it on in Settings > Privacy & Security to use My location.');
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ name: 'My location', detail: '', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => { console.warn('[Maps] geolocation failed:', err.message); toast('error', locationErrorMessage(err.code)); resolve(null); },
      { timeout: 15000, maximumAge: 60000 },
    );
  }), []);
  const locate = useCallback(() => {
    void myLocation().then(p => { if (p) goTo(p.lat, p.lon, p.name, 14); });
  }, [goTo, myLocation]);
  const createRouteMarker = useCallback((lon: number, lat: number, color: string) =>
    new maplibregl.Marker({ color, scale: 0.8 }).setLngLat([lon, lat]), []);
  const openDirections = useCallback((to: Place | null) => {
    setDirTo(to);
    setMeasuring(false);
    setDrawer('directions');
  }, []);

  // Copy current pin coordinates to clipboard (guarded).
  const copyPin = useCallback(async () => {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(fmtCoord(pin.lat, pin.lon));
      toast('success', 'Coordinates copied');
    } catch {
      toast('error', 'Could not copy coordinates');
    }
  }, [pin]);

  const sendPinToCalendar = () => {
    if (!pin) return;
    const start = new Date();
    start.setMinutes(Math.floor(start.getMinutes() / 30) * 30 + 30, 0, 0);
    openCalendarDraft({
      title: pin.name,
      start,
      end: new Date(start.getTime() + 30 * 60_000),
      description: [pin.detail, fmtCoord(pin.lat, pin.lon)].filter(Boolean).join('\n'),
    });
  };

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

  const showRecentPanel = focused && !query.trim() && recent.length > 0;

  const unified = useUnifiedChrome();
  if (failed) {
    return <AppErrorState description="The map engine could not start on this device." icon="map-pin" />;
  }

  const pillStyle = unified ? barPill : glassPill;
  const searchField = (
    <DexSearchInput
      fullWidth
      value={query}
      onChange={(e) => changeSearch(e.target.value)}
      onClear={() => changeSearch('')}
      loading={searching}
      style={unified
        ? { height: 28, borderRadius: 9999 }
        : { background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 9999, border: '1px solid var(--glass-edge)', boxShadow: 'var(--glass-shadow), var(--glass-rim)' }}
      placeholder="Search places"
      aria-label="Search places"
    />
  );
  const openTrackFile = async (file: File) => {
    try {
      const t = parseTrackFile(file.name, await file.text());
      setTrack(t);
      const b = trackBounds(t);
      if (b && mapRef.current) mapRef.current.fitBounds(b, { padding: 60, maxZoom: 16, duration: isReduceMotion() ? 0 : 800 });
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };
  const exportGpx = (withTrack: boolean) => {
    const lines = withTrack && track ? track.lines : [];
    const name = withTrack && track ? track.name : 'DEX saved places';
    downloadText(`${name.replace(/[\\/:*?"<>|]/g, '_')}.gpx`, toGpx(name, saved, lines), 'application/gpx+xml');
  };

  const actionButtons = (
    <>
      <input ref={trackInputRef} type="file" accept=".gpx,.kml,.geojson,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void openTrackFile(f); e.target.value = ''; }} />
      <button aria-label="Open a GPX, KML or GeoJSON track" onClick={() => trackInputRef.current?.click()} style={pillStyle}>
        <DexIcon name="file-plus" size={14} />
        Track
      </button>
      <button aria-label="Directions" aria-pressed={drawer === 'directions'}
        onClick={() => (drawer === 'directions' ? setDrawer(null) : openDirections(pin))}
        style={{ ...pillStyle, ...(drawer === 'directions' ? { background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)', borderColor: 'transparent' } : null) }}>
        <DexIcon name="navigation" size={14} />
        Directions
      </button>
      <button aria-label="Saved places" aria-pressed={drawer === 'saved'}
            onClick={() => setDrawer((d) => (d === 'saved' ? null : 'saved'))}
            style={{ ...pillStyle, ...(drawer === 'saved' ? { background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)', borderColor: 'transparent' } : null) }}>
            <DexIcon name="star" size={14} color="#FFD60A" />
            Saved{saved.length ? ` (${saved.length})` : ''}
          </button>
          <button aria-label="Measure distance" aria-pressed={measuring}
            onClick={() => {
              setMeasuring((m) => {
                const next = !m;
                if (next) { setDrawer('measure'); } else { setDrawer((d) => (d === 'measure' ? null : d)); clearMeasure(); }
                return next;
              });
            }}
            // (Active used --color-accent-primary, which does not exist: no fill at all.)
            style={{ ...pillStyle, ...(measuring ? { background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)', borderColor: 'transparent' } : null) }}>
            <DexIcon name="crosshair" size={14} />
            Measure
          </button>
    </>
  );

  return (
    <div className="dex-maps-root" data-own-gestures="" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--color-bg-base)' }}>
      <style>{MAPS_STYLE}</style>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {!mapReady && (
        <div role="status" aria-live="polite" style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 10,
          background: 'var(--color-bg-base)', color: 'var(--color-text-secondary)', fontSize: 13, pointerEvents: slowLoad ? 'auto' : 'none',
        }}>
          {slowLoad ? (navigator.onLine === false ? 'You are offline. The map needs a connection.' : 'The map is taking longer than usual.') : 'Loading map…'}
          {slowLoad && (
            <button type="button" onClick={() => { setSlowLoad(false); setMapGen(g => g + 1); }}
              style={{ height: 30, padding: '0 16px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)', fontSize: 12.5, fontWeight: 600 }}>
              Retry
            </button>
          )}
        </div>
      )}
      {tilesFailing && (
        <div role="status" className="dex-mat-opaque" style={{ position: 'absolute', left: '50%', top: unified ? 12 : 58, transform: 'translateX(-50%)', borderRadius: 9999, zIndex: 6, padding: '8px 12px', ...panel, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 'calc(100% - 32px)' }}>
          <DexIcon name="alert-triangle" size={14} color="var(--color-text-tertiary)" />
          Some map tiles could not load. Check your connection.
        </div>
      )}

      {/* Mirror current view for UKI screen-context. */}
      <span data-app-content style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        DEX Maps centered on {place}
      </span>

      {/* Search. In a unified window the field (and Saved / Measure) live in
          the window bar, so the map gets the whole body; results still drop
          down over the map. */}
      {unified && (
        <WindowToolbar inline={(bar) => <>{bar}</>}>
          <div style={{ width: 'min(320px, 50%)', minWidth: 160 }}
            onFocus={() => setFocused(true)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node) && !(e.relatedTarget as Element | null)?.closest?.('.dex-maps-search')) setFocused(false); }}>
            {searchField}
          </div>
          <span aria-hidden="true" style={{ flex: 1 }} />
          {actionButtons}
        </WindowToolbar>
      )}
      <div
        className="dex-maps-search"
        style={{ position: 'absolute', top: unified ? 8 : 12, left: 12, width: 'min(340px, calc(100% - 156px))', zIndex: 6 }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}
      >
        {!unified && searchField}
        {results.length > 0 && (
          <div role="listbox" aria-label="Search results" className="dex-mat-opaque dex-maps-card-enter" style={{ ...panel, marginTop: 6 }}>
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
                <button aria-label={isSaved(r.lat, r.lon) ? 'Remove from saved' : 'Save place'}
                  className="dex-maps-iconbtn"
                  onClick={() => toggleSaved(r)}
                  style={{ width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: isSaved(r.lat, r.lon) ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                  <DexIcon name={isSaved(r.lat, r.lon) ? 'star' : 'star-outline'} size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {showRecentPanel && (
          <div role="listbox" aria-label="Recent searches" className="dex-mat-opaque dex-maps-card-enter" style={{ ...panel, marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'none', letterSpacing: 0.4 }}>Recent</span>
              <button onClick={() => setRecent([])} className="dex-maps-iconbtn" style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '2px 6px' }}>Clear</button>
            </div>
            {recent.map((r, i) => (
              <button key={`rec-${r.lat},${r.lon},${i}`} role="option" aria-selected={false} className="dex-hover-bg dex-maps-result"
                onClick={() => pick(r)} style={{ ...rowBtn, borderTop: i ? '1px solid var(--color-border)' : 'none' }}>
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
          <div role="status" aria-label="Searching" className="dex-mat-opaque dex-maps-card-enter" style={{ marginTop: 6, padding: '10px 12px', ...panel, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            <span className="dex-maps-pulse" style={{ display: 'flex' }}><DexIcon name="search" size={14} color="var(--color-text-tertiary)" /></span>
            Searching places…
          </div>
        )}
        {query.trim() && !searching && results.length === 0 && searchError && (
          <div role="alert" className="dex-mat-opaque dex-maps-card-enter" style={{ marginTop: 6, padding: '14px 12px', ...panel, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            <DexIcon name="alert-triangle" size={20} color="var(--color-text-tertiary)" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{searchError === 'offline' ? 'You are offline' : 'Place search is unavailable'}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{searchError === 'offline' ? 'Connect to the internet to search for places.' : 'The search service did not respond. Try again in a moment.'}</span>
          </div>
        )}
        {query.trim() && !searching && results.length === 0 && !searchError && (
          <div role="status" className="dex-mat-opaque dex-maps-card-enter" style={{ marginTop: 6, padding: '14px 12px', ...panel, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            <DexIcon name="map-pin" size={20} color="var(--color-text-tertiary)" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>No places found</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Try a city, landmark, or address.</span>
          </div>
        )}
      </div>

      {/* Top-right action cluster: saved places + measure toggles */}
      {!unified && (
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 6 }}>
          {actionButtons}
        </div>
      )}

      {drawer === 'directions' && (
        <MapsDirections
          map={mapLive ? mapRef.current : null}
          initialTo={dirTo}
          pin={pin}
          myLocation={myLocation}
          top={unified ? 8 : 58}
          onClose={() => setDrawer(null)}
          createMarker={createRouteMarker}
        />
      )}

      {/* Saved places drawer */}
      {track && (
        <div role="region" aria-label="Opened track" className="dex-mat-opaque dex-maps-card-enter"
          style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 6, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 12px', ...panel, borderRadius: 9999 }}>
          <DexIcon name="map" size={14} color="var(--color-accent)" />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            {track.lines.length ? `${trackLengthKm(track).toFixed(trackLengthKm(track) < 10 ? 2 : 1)} km` : ''}{track.points.length ? `${track.lines.length ? ' · ' : ''}${track.points.length} place${track.points.length === 1 ? '' : 's'}` : ''}
          </span>
          <button onClick={() => exportGpx(true)} style={{ ...pillStyle, height: 26 }}>Export GPX</button>
          <button aria-label="Close track" onClick={() => setTrack(null)} className="dex-maps-iconbtn"
            style={{ width: 26, height: 26, borderRadius: 9999, background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DexIcon name="close" size={13} />
          </button>
        </div>
      )}
      {drawer === 'saved' && (
        <div className="dex-mat-opaque dex-maps-card-enter" style={{ position: 'absolute', top: unified ? 8 : 56, right: 12, width: 'min(280px, calc(100% - 24px))', maxHeight: 'calc(100% - 120px)', display: 'flex', flexDirection: 'column', ...panel, zIndex: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', flex: 1 }}>Saved places{saved.length ? ` · ${saved.length}` : ''}</span>
            {saved.length > 0 && (
              <button onClick={() => exportGpx(false)} className="dex-maps-iconbtn"
                style={{ height: 24, padding: '0 10px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginRight: 4 }}>
                Export GPX
              </button>
            )}
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
                <button aria-label="Use in distance measurement" className="dex-maps-iconbtn" onClick={() => measureFromSaved(s)}
                  style={{ width: 30, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>
                  <DexIcon name="crosshair" size={14} />
                </button>
                <button aria-label="Remove saved place" className="dex-maps-iconbtn" onClick={() => toggleSaved(s)}
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
        <div className="dex-mat-opaque" style={{ position: 'absolute', top: unified ? 8 : 56, right: 12, width: 'min(280px, calc(100% - 24px))', ...panel, zIndex: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Distance</span>
            <button aria-label="Close" onClick={() => { setDrawer(null); setMeasuring(false); clearMeasure(); }} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <DexIcon name="close" size={15} />
            </button>
          </div>
          <div style={{ padding: '12px' }}>
            {measurePts.length < 2 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                {measuring ? 'Click points on the map' : 'Turn on Measure, then click points'} or choose saved places.
                {measurePts.length === 1 && <div style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>First point set. Choose a second.</div>}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>{distanceKm.toFixed(1)}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>km</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{(distanceKm * 0.621371).toFixed(1)} mi · {measurePts.length} points</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
                  A: {fmtCoord(measurePts[0].lat, measurePts[0].lon)}<br />
                  End: {fmtCoord(measurePts[measurePts.length - 1].lat, measurePts[measurePts.length - 1].lon)}
                </div>
              </>
            )}
            {measurePts.length > 0 && (
              <button onClick={clearMeasure} style={{ marginTop: 12, width: '100%', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <DexIcon name="refresh" size={13} /> Reset
              </button>
            )}
            {measurePts.length > 0 && <button type="button" style={cardBtn}
              onClick={() => setMeasurePts(points => points.slice(0, -1))}>Remove last point</button>}
            {measurePts.length === 32 && <p role="status">Path limit reached (32 points).</p>}
          </div>
        </div>
      )}

      {/* Pin info card (coords + copy / save / send-to-notes) */}
      {pin && !measuring && drawer !== 'directions' && (
        <div className="dex-mat-opaque" style={{ position: 'absolute', left: 12, bottom: 72, width: 'min(300px, calc(100% - 24px))', ...panel, zIndex: 6 }}>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              <button type="button" onClick={() => openDirections(pin)} style={{ ...cardBtn, flexBasis: '100%', background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)', border: 'none', borderRadius: 9999 }}>
                <DexIcon name="navigation" size={13} /> Directions
              </button>
              <button onClick={copyPin} style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <DexIcon name="copy" size={13} /> Copy
              </button>
              <button onClick={() => toggleSaved(pin)} style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', color: isSaved(pin.lat, pin.lon) ? '#FFD60A' : 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <DexIcon name={isSaved(pin.lat, pin.lon) ? 'star' : 'star-outline'} size={13} /> {isSaved(pin.lat, pin.lon) ? 'Saved' : 'Save'}
              </button>
              <button onClick={sendPinToNotes} style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <DexIcon name="send" size={13} /> Notes
              </button>
              <button type="button" style={cardBtn} onClick={sendPinToCalendar}>Calendar</button>
              <button type="button" style={cardBtn} onClick={() => sendCreativeInput('qrcode', `geo:${pin.lat},${pin.lon}`)}>QR code</button>
            </div>
          </div>
        </div>
      )}

      {/* Vertical control stack (custom, DEX-styled) */}
      <div className="dex-mat-frosted" style={{ position: 'absolute', right: 12, bottom: 28, display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-md)', overflow: 'hidden', zIndex: 5 }}>
        <button aria-label="Zoom in" style={{ ...ctrlBtn, borderWidth: 0, borderBottom: '1px solid var(--color-border)' }}
          onClick={() => mapRef.current?.zoomIn()} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.10)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <DexIcon name="plus" size={16} />
        </button>
        <button aria-label="Zoom out" style={{ ...ctrlBtn, borderWidth: 0, borderBottom: '1px solid var(--color-border)' }}
          onClick={() => mapRef.current?.zoomOut()} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.10)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <DexIcon name="minus" size={16} />
        </button>
        <button aria-label="My location" style={{ ...ctrlBtn, borderWidth: 0 }}
          onClick={locate} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.10)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <DexIcon name="navigation" size={15} />
        </button>
      </div>

      {/* Compass (shows rotation; click = north up, flat) and 3D tilt. */}
      <div style={{ position: 'absolute', right: 12, bottom: 146, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 5 }}>
        <button aria-label={pitch > 1 ? 'Flat view' : '3D view'} aria-pressed={pitch > 1}
          onClick={() => mapRef.current?.easeTo({ pitch: pitch > 1 ? 0 : 60, duration: isReduceMotion() ? 0 : 400 })}
          className="dex-mat-frosted" style={{ ...ctrlBtn, borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 700, color: pitch > 1 ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>3D</button>
        <button aria-label="Reset to north" disabled={Math.abs(bearing) < 0.5 && pitch < 1}
          onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: isReduceMotion() ? 0 : 400 })}
          className="dex-mat-frosted" style={{ ...ctrlBtn, borderRadius: 'var(--radius-sm)', opacity: Math.abs(bearing) < 0.5 && pitch < 1 ? 0.55 : 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${-bearing}deg)`, transition: 'transform 0.1s linear' }}>
            <path d="M12 2l4 10h-8z" fill="#ff453a" /><path d="M12 22l-4-10h8z" fill="currentColor" opacity="0.6" />
          </svg>
        </button>
      </div>

      {/* Basemap: every style visible and one click away (was a button that cycled). */}
      <div className="dex-mat-frosted" style={{ position: 'absolute', left: 12, bottom: 28, zIndex: 5, borderRadius: 'var(--radius-sm)', padding: 2 }}>
        <SegmentedControl
          aria-label="Basemap"
          variant="subtle"
          size="lg"
          options={STYLE_ORDER.map(k => ({ value: k, label: MAP_STYLES[k].label, icon: <DexIcon name={MAP_STYLES[k].icon} size={13} /> }))}
          value={styleKey}
          onChange={(k) => setStyleKey(k as StyleKey)}
          style={{ background: 'transparent' }}
        />
      </div>
    </div>
  );
};

export default memo(DexMaps);
