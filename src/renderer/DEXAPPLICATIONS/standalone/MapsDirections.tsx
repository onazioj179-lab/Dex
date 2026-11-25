// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Maps directions: From / To (search, the dropped pin, or My location),
 * Drive / Cycle / Walk, the route drawn on the map, and turn-by-turn steps
 * (click a step to fly there). Routes come from OSRM (OpenStreetMap data).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
// Types only: Maps.tsx owns the maplibre runtime import (a runtime import here
// made a static chunk cycle Maps <-> MapsDirections and failed the build).
import type * as maplibregl from 'maplibre-gl';
import DexIcon from '../../components/DexIcon';
import { SegmentedControl } from '../../components/controls';
import { canvasColor } from '../../utils/canvasTheme';
import { isReduceMotion } from '../../utils/MotionController';
import {
  searchPlaces, fetchRoute, formatDistance, formatDuration, TRAVEL_MODES,
  type Place, type Route, type TravelMode,
} from './mapsServices';

const ROUTE_ID = 'dex-route';
const ROUTE_CASING = 'dex-route-casing';
const MODE_KEY = 'dex.maps.travelMode';

export interface MapsDirectionsProps {
  map: maplibregl.Map | null;
  /** Initial destination (the pin the user asked directions to). */
  initialTo: Place | null;
  /** The dropped pin, offered as a quick choice for either end. */
  pin: Place | null;
  /** Resolves the device position, or null (Location Services off / denied). */
  myLocation: () => Promise<Place | null>;
  top: number;
  onClose: () => void;
  /** Makes a map marker (supplied by Maps, which loads maplibre). */
  createMarker: (lon: number, lat: number, color: string) => maplibregl.Marker;
}

const pill: React.CSSProperties = {
  height: 24, padding: '0 10px', borderRadius: 9999, border: 'none', cursor: 'pointer', flexShrink: 0,
  background: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)', color: 'var(--color-text-primary)',
  fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4,
};

/** One end of the trip: shows the chosen place, or a search field to pick one. */
const Endpoint: React.FC<{
  label: string; dot: string; value: Place | null; onChange: (p: Place | null) => void;
  pin: Place | null; myLocation: () => Promise<Place | null>; near: () => { lat: number; lon: number } | undefined;
  autoFocus?: boolean;
}> = ({ label, dot, value, onChange, pin, myLocation, near, autoFocus }) => {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(!value);
  const [results, setResults] = useState<Place[]>([]);
  const [state, setState] = useState<'idle' | 'busy' | 'offline' | 'service' | 'none'>('idle');
  const [locating, setLocating] = useState(false);
  useEffect(() => { if (value) setEditing(false); }, [value]);
  useEffect(() => {
    const q = text.trim();
    if (!editing || q.length < 2) { setResults([]); setState('idle'); return; }
    const ctl = new AbortController();
    setState('busy');
    const t = window.setTimeout(async () => {
      const out = await searchPlaces(q, fetch, ctl.signal, near());
      if (ctl.signal.aborted) return;
      setResults(out.results);
      setState(out.error ?? (out.results.length ? 'idle' : 'none'));
    }, 300);
    return () => { window.clearTimeout(t); ctl.abort(); };
  }, [text, editing, near]);

  const choose = (p: Place) => { onChange(p); setText(''); setResults([]); setEditing(false); };
  const useLocation = async () => {
    setLocating(true);
    const p = await myLocation();
    setLocating(false);
    if (p) choose(p);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 9999, background: dot, flexShrink: 0 }} />
        {editing || !value ? (
          <input
            aria-label={`${label}: search for a place`}
            placeholder={`${label}: search a place or address`}
            value={text}
            autoFocus={autoFocus}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && results[0]) { e.preventDefault(); choose(results[0]); }
              if (e.key === 'Escape' && value) { e.stopPropagation(); setEditing(false); }
            }}
            style={{
              flex: 1, minWidth: 0, height: 30, padding: '0 12px', borderRadius: 9999, border: 'none', outline: 'none',
              background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)', color: 'var(--color-text-primary)', fontSize: 12.5,
            }}
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} aria-label={`${label}: ${value.name}. Change`}
            style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', color: 'var(--color-text-primary)' }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</span>
            {value.detail && <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.detail}</span>}
          </button>
        )}
      </div>
      {(editing || !value) && (
        <div style={{ display: 'flex', gap: 6, padding: '6px 0 0 16px', flexWrap: 'wrap' }}>
          <button type="button" style={pill} onClick={useLocation} disabled={locating}>
            <DexIcon name="navigation" size={11} /> {locating ? 'Locating…' : 'My location'}
          </button>
          {pin && <button type="button" style={pill} onClick={() => choose(pin)}><DexIcon name="map-pin" size={11} /> Dropped pin</button>}
        </div>
      )}
      {(editing || !value) && text.trim().length >= 2 && (
        <div role="listbox" aria-label={`${label} results`} style={{ marginTop: 6, marginLeft: 16, borderRadius: 10, overflow: 'hidden', background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)' }}>
          {state === 'busy' && results.length === 0 && <div role="status" style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>Searching…</div>}
          {state === 'none' && <div role="status" style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>No places found</div>}
          {(state === 'offline' || state === 'service') && <div role="alert" style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{state === 'offline' ? 'You are offline.' : 'Place search did not respond. Try again.'}</div>}
          {results.map((r, i) => (
            <button key={`${r.lat},${r.lon},${i}`} type="button" role="option" aria-selected={false} className="dex-hover-bg" onClick={() => choose(r)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)' }}>
              <span style={{ display: 'block', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              {r.detail && <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const MapsDirections: React.FC<MapsDirectionsProps> = ({ map, initialTo, pin, myLocation, top, onClose, createMarker }) => {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(initialTo);
  const [mode, setMode] = useState<TravelMode>(() => {
    try { const m = localStorage.getItem(MODE_KEY); return m === 'bike' || m === 'foot' ? m : 'car'; } catch { return 'car'; }
  });
  const [route, setRoute] = useState<Route | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'offline' | 'service' | 'no-route'>('idle');
  const endMarkers = useRef<maplibregl.Marker[]>([]);
  useEffect(() => { if (initialTo) setTo(initialTo); }, [initialTo]);
  useEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage blocked */ } }, [mode]);

  const near = useCallback(() => {
    let c: { lat: number; lng: number } | undefined;
    try { c = map?.getCenter(); } catch { c = undefined; }
    return c ? { lat: c.lat, lon: c.lng } : undefined;
  }, [map]);

  // Fetch the route whenever both ends and the mode are set.
  useEffect(() => {
    if (!from || !to) { setRoute(null); setStatus('idle'); return; }
    const ctl = new AbortController();
    setStatus('loading');
    void fetchRoute(mode, from, to, fetch, ctl.signal).then(out => {
      if (ctl.signal.aborted) return;
      setRoute(out.route);
      setStatus(out.error ?? 'idle');
    });
    return () => ctl.abort();
  }, [from, to, mode]);

  // Draw the route (casing + line) and fit it; cleared when the panel closes.
  useEffect(() => {
    if (!map) return;
    const clear = () => {
      for (const id of [ROUTE_ID, ROUTE_CASING]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(ROUTE_ID)) map.removeSource(ROUTE_ID);
    };
    const draw = () => {
      try {
        clear();
        if (!route) return;
        map.addSource(ROUTE_ID, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates } } });
        map.addLayer({ id: ROUTE_CASING, type: 'line', source: ROUTE_ID, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 } });
        map.addLayer({
          id: ROUTE_ID, type: 'line', source: ROUTE_ID, layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': canvasColor('--color-accent'), 'line-width': 5, ...(mode === 'foot' ? { 'line-dasharray': [0.1, 1.6] } : {}) },
        });
      } catch { /* style still loading: redrawn on styledata */ }
    };
    draw();
    if (route) {
      const lons = route.coordinates.map(c => c[0]); const lats = route.coordinates.map(c => c[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: { top: 60, bottom: 60, left: 360, right: 60 }, duration: isReduceMotion() ? 0 : 700, maxZoom: 16 });
    }
    // A basemap switch wipes custom layers: put the route back.
    const onStyle = () => { if (route && !map.getSource(ROUTE_ID)) draw(); };
    map.on('styledata', onStyle);
    return () => { map.off('styledata', onStyle); try { clear(); } catch { /* map gone */ } };
  }, [map, route, mode]);

  // Start / end markers.
  useEffect(() => {
    if (!map) return;
    endMarkers.current.forEach(m => m.remove());
    endMarkers.current = [];
    const make = (p: Place, color: string) => createMarker(p.lon, p.lat, color).addTo(map);
    if (from) endMarkers.current.push(make(from, '#30d158'));
    if (to) endMarkers.current.push(make(to, canvasColor('--color-accent')));
    return () => { endMarkers.current.forEach(m => m.remove()); endMarkers.current = []; };
  }, [map, from, to, createMarker]);

  const swap = () => { setFrom(to); setTo(from); };
  const flyTo = (lat: number, lon: number) => map?.flyTo({ center: [lon, lat], zoom: 17, duration: isReduceMotion() ? 0 : 600 });

  return (
    <section aria-label="Directions" className="dex-mat-opaque dex-maps-card-enter"
      style={{ position: 'absolute', top, left: 12, bottom: 72, width: 'min(330px, calc(100% - 24px))', zIndex: 7, display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 8px 14px' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', flex: 1 }}>Directions</span>
        <button type="button" aria-label="Swap start and destination" onClick={swap} disabled={!from && !to}
          style={{ ...pill, width: 28, height: 28, padding: 0, justifyContent: 'center' }}>
          <DexIcon name="refresh" size={13} />
        </button>
        <button type="button" aria-label="Close directions" onClick={onClose}
          style={{ ...pill, width: 28, height: 28, padding: 0, justifyContent: 'center' }}>
          <DexIcon name="close" size={13} />
        </button>
      </header>
      <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Endpoint label="From" dot="#30d158" value={from} onChange={setFrom} pin={pin} myLocation={myLocation} near={near} autoFocus={!!to && !from} />
        <Endpoint label="To" dot="var(--color-accent)" value={to} onChange={setTo} pin={pin} myLocation={myLocation} near={near} />
        <SegmentedControl aria-label="Travel mode" size="sm" fill options={TRAVEL_MODES} value={mode} onChange={setMode} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', borderTop: '1px solid var(--color-border-subtle)' }}>
        {status === 'idle' && !route && (
          <p style={{ margin: 0, padding: '16px 14px', fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            Choose where you start and where you are going. Search a place, use the dropped pin, or My location.
          </p>
        )}
        {status === 'loading' && <p role="status" style={{ margin: 0, padding: '16px 14px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>Finding the best route…</p>}
        {status === 'no-route' && <p role="alert" style={{ margin: 0, padding: '16px 14px', fontSize: 12, color: 'var(--color-text-secondary)' }}>No {mode === 'car' ? 'driving' : mode === 'bike' ? 'cycling' : 'walking'} route between these places.</p>}
        {(status === 'offline' || status === 'service') && (
          <p role="alert" style={{ margin: 0, padding: '16px 14px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {status === 'offline' ? 'You are offline. Connect to get directions.' : 'The routing service did not respond. Try again in a moment.'}
          </p>
        )}
        {route && status !== 'loading' && (
          <>
            <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatDuration(route.duration)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{formatDistance(route.distance)}</span>
            </div>
            <ol aria-label="Turn-by-turn steps" style={{ listStyle: 'none', margin: 0, padding: '0 6px 10px' }}>
              {route.steps.map((s, i) => (
                <li key={i}>
                  <button type="button" className="dex-hover-bg" onClick={() => flyTo(s.lat, s.lon)}
                    style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '8px', border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                    <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 9999, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, background: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.35 }}>{s.text}</span>
                      {s.distance > 0 && <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{formatDistance(s.distance)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <p style={{ margin: 0, padding: '0 14px 12px', fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>Route data © OpenStreetMap contributors, OSRM.</p>
          </>
        )}
      </div>
    </section>
  );
};

export default MapsDirections;
