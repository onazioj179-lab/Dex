// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Free APIs — abstraction over zero-cost public APIs.
 *
 * All endpoints chosen to be:
 *   - Keyless (no signup, no API token)
 *   - HTTPS-only
 *   - CORS-enabled or proxiable through main process
 *   - Rate-limit friendly with local caching
 *
 * Endpoints:
 *   - Wikipedia REST summary: https://en.wikipedia.org/api/rest_v1/page/summary
 *   - Open-Meteo (weather, no key): https://api.open-meteo.com/v1/forecast
 *   - Open-Meteo geocoding: https://geocoding-api.open-meteo.com/v1/search
 *   - WorldTimeAPI: https://worldtimeapi.org/api/timezone
 *   - DuckDuckGo Instant Answer: https://api.duckduckgo.com (limited)
 *
 * Caching: every successful response is stored in UkiCache with a
 * sensible TTL. Offline calls fall back to last cached value.
 */

import * as cache from './cache';

const UA = 'DEX-UKI/1.0 (local-first desktop assistant)';

interface FetchJsonOpts {
  ttlMs?: number;
  cacheKey?: string;
  signal?: AbortSignal;
  /** When true, prefer cache even if not stale. */
  preferCache?: boolean;
}

async function fetchJson<T = unknown>(url: string, opts: FetchJsonOpts = {}): Promise<T> {
  const cacheKey = opts.cacheKey ?? `api:${url}`;
  const ttl = opts.ttlMs ?? 10 * 60 * 1000;

  if (opts.preferCache) {
    const cached = cache.get<T>(cacheKey);
    if (cached !== undefined) return cached;
  }

  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  if (!online) {
    const cached = cache.get<T>(cacheKey);
    if (cached !== undefined) return cached;
    throw new Error('offline and no cached value available');
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': UA },
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as T;
    cache.set(cacheKey, data, { ttl });
    return data;
  } catch (err) {
    const cached = cache.get<T>(cacheKey);
    if (cached !== undefined) return cached;
    throw err;
  }
}

// ---------- Wikipedia ----------

export interface WikiSummary {
  title: string;
  extract: string;
  description?: string;
  thumbnail?: { source: string; width: number; height: number };
  contentUrl?: string;
}

export async function lookupWikipedia(query: string, signal?: AbortSignal): Promise<WikiSummary | null> {
  const slug = encodeURIComponent(query.trim().replace(/\s+/g, '_'));
  if (!slug) return null;
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
  try {
    const raw = await fetchJson<{ title: string; extract: string; description?: string; thumbnail?: { source: string; width: number; height: number }; content_urls?: { desktop?: { page?: string } } }>(
      url, { ttlMs: 24 * 60 * 60 * 1000, cacheKey: `wiki:${slug}`, signal }
    );
    return {
      title: raw.title,
      extract: raw.extract,
      description: raw.description,
      thumbnail: raw.thumbnail,
      contentUrl: raw.content_urls?.desktop?.page,
    };
  } catch {
    return null;
  }
}

// ---------- Weather (Open-Meteo) ----------

export interface WeatherNow {
  temperatureC: number;
  windKph: number;
  weatherCode: number;
  locationName: string;
  timezone: string;
}

interface GeocodeHit { name: string; latitude: number; longitude: number; country?: string; timezone?: string }

export async function lookupWeather(place: string, signal?: AbortSignal): Promise<WeatherNow | null> {
  const q = place.trim();
  if (!q) return null;
  try {
    const geo = await fetchJson<{ results?: GeocodeHit[] }>(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(q)}`,
      { ttlMs: 24 * 60 * 60 * 1000, cacheKey: `geo:${q.toLowerCase()}`, signal }
    );
    const hit = geo.results?.[0];
    if (!hit) return null;
    const fc = await fetchJson<{ current: { temperature_2m: number; wind_speed_10m: number; weather_code: number }; timezone: string }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`,
      { ttlMs: 15 * 60 * 1000, cacheKey: `wx:${hit.latitude.toFixed(2)},${hit.longitude.toFixed(2)}`, signal }
    );
    return {
      temperatureC: fc.current.temperature_2m,
      windKph: fc.current.wind_speed_10m,
      weatherCode: fc.current.weather_code,
      locationName: hit.country ? `${hit.name}, ${hit.country}` : hit.name,
      timezone: fc.timezone,
    };
  } catch {
    return null;
  }
}

/** Translate Open-Meteo WMO weather codes to short text. */
export function weatherCodeToText(code: number): string {
  if (code === 0) return 'clear';
  if (code <= 3) return 'partly cloudy';
  if (code <= 48) return 'foggy';
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'snowy';
  if (code <= 82) return 'showers';
  if (code <= 86) return 'snow showers';
  if (code <= 99) return 'thunderstorm';
  return 'unknown';
}

// ---------- World Time ----------

export interface WorldTime {
  datetime: string;
  timezone: string;
  utcOffset: string;
}

export async function lookupWorldTime(timezone: string, signal?: AbortSignal): Promise<WorldTime | null> {
  const tz = timezone.trim().replace(/^\/+/, '');
  if (!tz) return null;
  try {
    const raw = await fetchJson<{ datetime: string; timezone: string; utc_offset: string }>(
      `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz).replace(/%2F/g, '/')}`,
      { ttlMs: 60 * 1000, cacheKey: `time:${tz}`, signal }
    );
    return { datetime: raw.datetime, timezone: raw.timezone, utcOffset: raw.utc_offset };
  } catch {
    return null;
  }
}

// ---------- DuckDuckGo Instant Answer ----------

export interface InstantAnswer {
  abstract: string;
  abstractSource?: string;
  abstractURL?: string;
  heading?: string;
}

export async function lookupInstantAnswer(query: string, signal?: AbortSignal): Promise<InstantAnswer | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const raw = await fetchJson<{ Abstract: string; AbstractSource?: string; AbstractURL?: string; Heading?: string }>(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1&t=DEX-UKI`,
      { ttlMs: 60 * 60 * 1000, cacheKey: `ddg:${q.toLowerCase()}`, signal }
    );
    if (!raw.Abstract) return null;
    return { abstract: raw.Abstract, abstractSource: raw.AbstractSource, abstractURL: raw.AbstractURL, heading: raw.Heading };
  } catch {
    return null;
  }
}
