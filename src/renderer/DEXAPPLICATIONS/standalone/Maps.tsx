// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Maps -- interactive vector maps and navigation.
 *
 * Rendering: MapLibre GL with free, key-less OpenFreeMap vector tiles.
 * Search:    Open-Meteo geocoding (free, no key -- same source DEX Weather uses).
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
import { AppErrorState } from '../../ui/AppStates';
import { useAppTracking } from '../../services/usePatternLearning';

// Free, key-less vector styles from OpenFreeMap (OSM data).
const MAP_STYLES: Record<string, { url: string; label: string }> = {
  liberty: { url: 'https://tiles.openfreemap.org/styles/liberty', label: 'Streets' },
  positron: { url: 'https://tiles.openfreemap.org/styles/positron', label: 'Minimal' },
};
type StyleKey = keyof typeof MAP_STYLES;

interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  detail: string;
}

// Geocode a place name via Open-Meteo (free, no API key).
const geocode = async (q: string): Promise<GeoResult[]> => {
  if (!q.trim()) return [];
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`);
    const data = await res.json();
    if (!Array.isArray(data.results)) return [];
    return data.results.map((r: any): GeoResult => ({
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      detail: [r.admin1, r.country].filter(Boolean).join(', '),
    }));
  } catch (err) {
    console.warn('[Maps] Geocode failed:', err);
    return [];
  }
};

const ctrlBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)', cursor: 'pointer', padding: 0,
  transition: 'background 0.12s ease',
};

const DexMaps: React.FC = () => {
  useAppTracking('maps');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [styleKey, setStyleKey] = useState<StyleKey>('liberty');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [place, setPlace] = useState('San Francisco');
  const [failed, setFailed] = useState(false);

  // Fly to a coordinate and drop / move the marker.
  const goTo = useCallback((lat: number, lon: number, label: string, zoom = 12) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [lon, lat], zoom, essential: true });
    if (markerRef.current) {
      markerRef.current.setLngLat([lon, lat]);
    } else {
      markerRef.current = new maplibregl.Marker({ color: '#4A9EFF' }).setLngLat([lon, lat]).addTo(map);
    }
    setPlace(label);
  }, []);

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLES[styleKey].url,
        center: [-122.4194, 37.7749],
        zoom: 11,
      });
    } catch (err) {
      console.warn('[Maps] Map init failed:', err);
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.on('error', (e) => {
      // Style/tile fetch failure (e.g. offline) -- surface a soft hint, keep canvas.
      console.warn('[Maps] map error:', e?.error?.message || e);
    });
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the basemap style when toggled (preserves camera).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[styleKey].url);
  }, [styleKey]);

  // UKI-driven navigation: assistant dispatches `dex-maps-goto`.
  useEffect(() => {
    const onGoto = async (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (typeof d.lat === 'number' && typeof d.lon === 'number') {
        goTo(d.lat, d.lon, d.label || 'Location', d.zoom ?? 12);
      } else if (typeof d.query === 'string') {
        const hits = await geocode(d.query);
        if (hits[0]) goTo(hits[0].lat, hits[0].lon, hits[0].name);
      }
    };
    window.addEventListener('dex-maps-goto', onGoto as EventListener);
    return () => window.removeEventListener('dex-maps-goto', onGoto as EventListener);
  }, [goTo]);

  // Debounced search-as-you-type.
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const hits = await geocode(query);
      if (!cancelled) { setResults(hits); setSearching(false); }
    }, 320);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const pick = useCallback((r: GeoResult) => {
    goTo(r.lat, r.lon, r.name);
    setQuery('');
    setResults([]);
  }, [goTo]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => goTo(pos.coords.latitude, pos.coords.longitude, 'My location', 14),
      (err) => console.warn('[Maps] geolocation denied:', err.message),
    );
  }, [goTo]);

  if (failed) {
    return <AppErrorState title="Maps unavailable" description="The map engine could not start on this device." icon="map-pin" />;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--color-bg-base)' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Mirror current view for UKI screen-context. */}
      <span data-app-content style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        DEX Maps centered on {place}
      </span>

      {/* Search */}
      <div style={{ position: 'absolute', top: 12, left: 12, width: 'min(320px, calc(100% - 24px))', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px',
          background: 'var(--color-bg-glass-strong, rgba(26,26,30,0.9))', backdropFilter: 'var(--blur-lg)', WebkitBackdropFilter: 'var(--blur-lg)',
          border: '1px solid var(--color-border)', borderRadius: 10 }}>
          <DexIcon name="search" size={15} color="var(--color-text-tertiary)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search places"
            aria-label="Search places"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--color-text-primary)', fontSize: 13 }}
          />
          {searching && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" aria-hidden style={{ animation: 'spin 0.8s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
        </div>
        {results.length > 0 && (
          <div role="listbox" aria-label="Search results" style={{ marginTop: 6, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            {results.map((r, i) => (
              <button key={`${r.lat},${r.lon},${i}`} role="option" aria-selected={false} onClick={() => pick(r)} className="dex-hover-bg"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, width: '100%', textAlign: 'left',
                  padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{r.name}</span>
                {r.detail && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.detail}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

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

      {/* Basemap style toggle */}
      <button aria-label={`Switch to ${MAP_STYLES[styleKey === 'liberty' ? 'positron' : 'liberty'].label} basemap`}
        onClick={() => setStyleKey(k => (k === 'liberty' ? 'positron' : 'liberty'))}
        style={{ position: 'absolute', left: 12, bottom: 28, height: 34, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 10,
          color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', zIndex: 5 }}>
        <DexIcon name="layers" size={14} />
        {MAP_STYLES[styleKey].label}
      </button>
    </div>
  );
};

export default memo(DexMaps);
