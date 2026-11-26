// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseCoordinates, formatCoordinates, parseTrackFile, trackLengthKm, trackBounds, toGpx } from '../../src/renderer/DEXAPPLICATIONS/standalone/mapsTracks';

describe('Maps coordinates', () => {
  it('reads decimal pairs', () => {
    expect(parseCoordinates('6.5244, 3.3792')).toEqual({ lat: 6.5244, lon: 3.3792 });
    expect(parseCoordinates('-33.8688 151.2093')).toEqual({ lat: -33.8688, lon: 151.2093 });
    expect(parseCoordinates('40.7128,-74.0060')).toEqual({ lat: 40.7128, lon: -74.006 });
  });

  it('reads degrees, minutes, seconds with hemispheres', () => {
    const p = parseCoordinates(`48°51'29.6"N 2°17'40.2"E`)!;
    expect(p.lat).toBeCloseTo(48.85822, 4);
    expect(p.lon).toBeCloseTo(2.29450, 4);
    const q = parseCoordinates('33 52 7.7 S, 151 12 33.5 E')!;
    expect(q.lat).toBeCloseTo(-33.86881, 4);
    expect(q.lon).toBeCloseTo(151.20931, 4);
    const r = parseCoordinates('N 48.858 E 2.294')!;
    expect(r).toEqual({ lat: 48.858, lon: 2.294 });
  });

  it('ignores place names and impossible values', () => {
    expect(parseCoordinates('Lagos')).toBeNull();
    expect(parseCoordinates('10 Downing Street')).toBeNull();
    expect(parseCoordinates('95.0, 10.0')).toBeNull();
    expect(parseCoordinates('12, 200.5')).toBeNull();
  });

  it('formats coordinates', () => {
    expect(formatCoordinates({ lat: -33.86881, lon: 151.20931 })).toBe('33.86881° S, 151.20931° E');
  });
});

const GPX = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Morning run</name></metadata>
<wpt lat="6.45" lon="3.39"><name>Start</name></wpt>
<trk><trkseg><trkpt lat="6.45" lon="3.39"/><trkpt lat="6.46" lon="3.39"/><trkpt lat="6.46" lon="3.40"/></trkseg></trk></gpx>`;

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Hike</name>
<Placemark><name>Summit</name><Point><coordinates>2.29,48.85,0</coordinates></Point></Placemark>
<Placemark><LineString><coordinates>2.29,48.85,0 2.30,48.86,0</coordinates></LineString></Placemark></Document></kml>`;

const GEOJSON = JSON.stringify({ type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { name: 'Cafe' }, geometry: { type: 'Point', coordinates: [3.4, 6.5] } },
  { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[3.4, 6.5], [3.41, 6.51]]] } },
] });

describe('Maps track files', () => {
  it('reads GPX tracks and waypoints', () => {
    const t = parseTrackFile('run.gpx', GPX);
    expect(t.name).toBe('Morning run');
    expect(t.lines).toEqual([[[3.39, 6.45], [3.39, 6.46], [3.4, 6.46]]]);
    expect(t.points).toEqual([{ name: 'Start', lat: 6.45, lon: 3.39 }]);
    expect(trackLengthKm(t)).toBeCloseTo(2.22, 1);
    expect(trackBounds(t)).toEqual([[3.39, 6.45], [3.4, 6.46]]);
  });

  it('reads KML placemarks and lines', () => {
    const t = parseTrackFile('x.kml', KML);
    expect(t.name).toBe('Hike');
    expect(t.points[0]).toEqual({ name: 'Summit', lon: 2.29, lat: 48.85 });
    expect(t.lines[0]).toHaveLength(2);
  });

  it('reads GeoJSON features', () => {
    const t = parseTrackFile('places.geojson', GEOJSON);
    expect(t.points).toEqual([{ name: 'Cafe', lon: 3.4, lat: 6.5 }]);
    expect(t.lines).toHaveLength(1);
  });

  it('explains files it cannot use', () => {
    expect(() => parseTrackFile('a.txt', 'hello')).toThrow(/GPX, KML or GeoJSON/);
    expect(() => parseTrackFile('a.gpx', '<gpx></gpx>')).toThrow(/No tracks or places/);
  });

  it('writes GPX that reads back the same', () => {
    const gpx = toGpx('Trip & notes', [{ name: 'Home <1>', lat: 6.45, lon: 3.39 }], [[[3.39, 6.45], [3.4, 6.46]]]);
    expect(gpx).toContain('Trip &amp; notes');
    const back = parseTrackFile('back.gpx', gpx);
    expect(back.points).toEqual([{ name: 'Home <1>', lat: 6.45, lon: 3.39 }]);
    expect(back.lines).toEqual([[[3.39, 6.45], [3.4, 6.46]]]);
  });
});
