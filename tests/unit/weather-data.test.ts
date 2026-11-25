// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ageLabel, loadActiveWeather, cacheKeyFor, hourlyFrom } from '../../src/renderer/DEXAPPLICATIONS/standalone/weatherData';

const sample = (fetchedAt: number) => ({
  current: { temp: 12, feelsLike: 10, condition: 'rain', humidity: 80, wind: 5, uvIndex: 1, visibility: 10, pressure: 1010, sunrise: null, sunset: null },
  forecast: [], hourly: [], fetchedAt,
});

const okJson = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

describe('weatherData', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('labels age', () => {
    const now = 1_000_000_000;
    expect(ageLabel(now, now)).toBe('just now');
    expect(ageLabel(now - 12 * 60000, now)).toBe('12 min ago');
    expect(ageLabel(now - 3 * 3600000, now)).toBe('3 h ago');
    expect(ageLabel(now - 72 * 3600000, now)).toBe('3 d ago');
  });

  it('returns null with no active location and never fetches', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await loadActiveWeather()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses a fresh cache without fetching', async () => {
    localStorage.setItem('dex-weather-active', 'Lagos');
    localStorage.setItem(cacheKeyFor('Lagos'), JSON.stringify(sample(Date.now())));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await loadActiveWeather();
    expect(res?.data.current.temp).toBe(12);
    expect(res?.stale).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refetches an old cache and writes it back', async () => {
    localStorage.setItem('dex-weather-active', 'Lagos');
    localStorage.setItem(cacheKeyFor('Lagos'), JSON.stringify(sample(Date.now() - 2 * 3600000)));
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('geocoding')
      ? okJson({ results: [{ latitude: 6.5, longitude: 3.4, name: 'Lagos', country: 'Nigeria' }] })
      : okJson({
        current: { temperature_2m: 29.4, apparent_temperature: 33, weather_code: 0, relative_humidity_2m: 70, wind_speed_10m: 9, surface_pressure: 1009 },
        daily: { time: ['2026-11-12'], sunrise: ['2026-11-12T06:30'], sunset: ['2026-11-12T18:20'] },
        hourly: { temperature_2m: [], weather_code: [] },
      })));
    const res = await loadActiveWeather();
    expect(res?.data.current.temp).toBe(29);
    expect(res?.stale).toBe(false);
    expect(JSON.parse(localStorage.getItem(cacheKeyFor('Lagos'))!).current.temp).toBe(29);
  });

  it('falls back to the old cache, marked stale, when offline', async () => {
    localStorage.setItem('dex-weather-active', 'Lagos');
    localStorage.setItem(cacheKeyFor('Lagos'), JSON.stringify(sample(Date.now() - 2 * 3600000)));
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const res = await loadActiveWeather();
    expect(res?.stale).toBe(true);
    expect(res?.data.current.temp).toBe(12);
  });
});

describe('weather hourly strip uses the city clock', () => {
  it('starts at the city current hour, not the computer hour', () => {
    const time = Array.from({ length: 48 }, (_, i) => `2026-11-24T${String(i % 24).padStart(2, '0')}:00`.replace('2026-11-24', i < 24 ? '2026-11-24' : '2026-11-25'));
    const temperature_2m = time.map((_, i) => i);
    const out = hourlyFrom({ time, temperature_2m, weather_code: [] }, '2026-11-24T22:45', 0);
    expect(out[0]).toMatchObject({ hour: 'Now', temp: 22 });
    expect(out[1]).toMatchObject({ hour: '23:00', temp: 23 });
    expect(out[2]).toMatchObject({ hour: '00:00', temp: 24 });
    expect(out).toHaveLength(12);
  });
});
