// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import {
  searchPlaces, reversePlace, fetchRoute, routeUrl, stepText, photonPlace, formatDistance, formatDuration,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/mapsServices';

const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const feature = (props: Record<string, unknown>, lon = 2.2945, lat = 48.8583) => ({ geometry: { coordinates: [lon, lat] }, properties: props });

describe('Maps place search (addresses and landmarks)', () => {
  it('finds landmarks and addresses with a context line, biased to the map', async () => {
    const f = vi.fn(async () => res(200, { features: [
      feature({ name: 'Eiffel Tower', street: 'Avenue Anatole France', housenumber: '5', city: 'Paris', state: 'Île-de-France', country: 'France' }),
      feature({ street: 'Baker Street', housenumber: '221B', city: 'London', country: 'United Kingdom' }, -0.158, 51.523),
      { geometry: { coordinates: ['x', 1] }, properties: { name: 'Broken' } },
    ] }));
    const out = await searchPlaces('eiffel', f as unknown as typeof fetch, undefined, { lat: 48.85, lon: 2.35 });
    expect(out.error).toBeNull();
    expect(out.results[0]).toEqual({ name: 'Eiffel Tower', detail: 'Avenue Anatole France 5, Paris, Île-de-France, France', lat: 48.8583, lon: 2.2945 });
    expect(out.results[1].name).toBe('Baker Street 221B');
    expect(out.results).toHaveLength(2);
    expect(String(f.mock.calls[0][0])).toContain('lat=48.8500&lon=2.3500');
  });

  it('drops duplicate rows and repeated context parts', () => {
    expect(photonPlace(feature({ name: 'Paris', city: 'Paris', state: 'Paris', country: 'France' }))?.detail).toBe('France');
  });

  it('reports failures as errors, never as "nothing found"', async () => {
    expect((await searchPlaces('x', (async () => res(502, {})) as unknown as typeof fetch)).error).toBe('service');
    expect((await searchPlaces('x', (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).error).toMatch(/offline|service/);
    const f = vi.fn();
    expect(await searchPlaces('  ', f as unknown as typeof fetch)).toEqual({ results: [], error: null });
    expect(f).not.toHaveBeenCalled();
  });

  it('reverse geocodes a pin but keeps the exact clicked point', async () => {
    const p = await reversePlace(48.1, 2.1, (async () => res(200, { features: [feature({ street: 'Rue X', housenumber: '3', city: 'Y', country: 'France' })] })) as unknown as typeof fetch);
    expect(p).toEqual({ name: 'Rue X 3', detail: 'Y, France', lat: 48.1, lon: 2.1 });
    expect(await reversePlace(0, 0, (async () => res(500, {})) as unknown as typeof fetch)).toBeNull();
  });
});

describe('Maps directions', () => {
  it('builds the profile URL lon,lat order', () => {
    expect(routeUrl('foot', { lat: 48.8, lon: 2.3 }, { lat: 48.9, lon: 2.4 }))
      .toBe('https://routing.openstreetmap.de/routed-foot/route/v1/driving/2.300000,48.800000;2.400000,48.900000?overview=full&geometries=geojson&steps=true');
  });

  it('parses a route with plain-English steps', async () => {
    const body = { code: 'Ok', routes: [{ distance: 3400, duration: 2700, geometry: { coordinates: [[2.29, 48.85], [2.3, 48.86], [2.33, 48.86]] }, legs: [{ steps: [
      { name: 'Avenue Gustave Eiffel', distance: 153, duration: 122, maneuver: { type: 'depart', bearing_after: 44, location: [2.29, 48.85] } },
      { name: 'Quai Branly', distance: 900, duration: 700, maneuver: { type: 'turn', modifier: 'right', location: [2.3, 48.86] } },
      { name: '', distance: 0, duration: 0, maneuver: { type: 'arrive', modifier: 'left', location: [2.33, 48.86] } },
    ] }] }] };
    const out = await fetchRoute('foot', { lat: 48.85, lon: 2.29 }, { lat: 48.86, lon: 2.33 }, (async () => res(200, body)) as unknown as typeof fetch);
    expect(out.error).toBeNull();
    expect(out.route?.coordinates).toHaveLength(3);
    expect(out.route?.steps.map(s => s.text)).toEqual([
      'Head northeast on Avenue Gustave Eiffel', 'Turn right onto Quai Branly', 'Arrive at your destination, on the left',
    ]);
  });

  it('tells "no route" apart from a broken service', async () => {
    expect((await fetchRoute('car', { lat: 0, lon: 0 }, { lat: 1, lon: 1 }, (async () => res(400, { code: 'NoRoute' })) as unknown as typeof fetch)).error).toBe('no-route');
    expect((await fetchRoute('car', { lat: 0, lon: 0 }, { lat: 1, lon: 1 }, (async () => res(503, null)) as unknown as typeof fetch)).error).toBe('service');
  });

  it('words roundabouts, forks and ramps', () => {
    expect(stepText({ name: 'A1', maneuver: { type: 'roundabout', exit: 2 } })).toBe('At the roundabout, take the 2nd exit onto A1');
    expect(stepText({ maneuver: { type: 'fork', modifier: 'slight left' } })).toBe('Keep left at the fork');
    expect(stepText({ name: 'M4', maneuver: { type: 'off ramp', modifier: 'slight right' } })).toBe('Take the exit on the right onto M4');
    expect(stepText({ name: 'Lincoln Way', maneuver: { type: 'continue', modifier: 'uturn' } })).toBe('Make a U-turn onto Lincoln Way');
    expect(stepText({ name: 'Lincoln Way', maneuver: { type: 'new name', modifier: 'slight right' } })).toBe('Bear right onto Lincoln Way');
  });

  it('formats distance and time', () => {
    expect(formatDistance(153)).toBe('150 m');
    expect(formatDistance(3400)).toBe('3.4 km');
    expect(formatDistance(23400)).toBe('23 km');
    expect(formatDuration(30)).toBe('1 min');
    expect(formatDuration(2700)).toBe('45 min');
    expect(formatDuration(3900)).toBe('1 h 05 min');
  });
});
