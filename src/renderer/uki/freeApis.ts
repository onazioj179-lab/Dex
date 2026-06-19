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
 *   - Wikipedia title search:  https://en.wikipedia.org/w/rest.php/v1/search/title
 *   - Open-Meteo (weather, no key): https://api.open-meteo.com/v1/forecast
 *   - Open-Meteo geocoding: https://geocoding-api.open-meteo.com/v1/search
 *   - WorldTimeAPI: https://worldtimeapi.org/api/timezone
 *   - DuckDuckGo Instant Answer: https://api.duckduckgo.com (limited)
 *   - Free Dictionary: https://api.dictionaryapi.dev/api/v2/entries/en
 *   - ExchangeRate (open, no key): https://open.er-api.com/v6/latest
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

/**
 * Resolve a free-text query to the closest Wikipedia article title, then return
 * its summary. More forgiving than {@link lookupWikipedia}, which needs the exact
 * page slug — this first runs a title search so "who invented the telephone" or
 * "ada lovelace" land on the right article. Falls back to a direct summary lookup
 * when the search endpoint yields nothing.
 */
export async function searchWikipedia(query: string, signal?: AbortSignal): Promise<WikiSummary | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const found = await fetchJson<{ pages?: Array<{ title: string }> }>(
      `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`,
      { ttlMs: 24 * 60 * 60 * 1000, cacheKey: `wikisearch:${q.toLowerCase()}`, signal },
    );
    const title = found.pages?.[0]?.title;
    if (title) {
      const hit = await lookupWikipedia(title, signal);
      if (hit) return hit;
    }
  } catch {
    /* fall through to a direct summary attempt */
  }
  return lookupWikipedia(q, signal);
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

// ---------- Dictionary (dictionaryapi.dev) ----------

export interface WordDefinition {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  definition: string;
  example?: string;
}

/**
 * Look up the primary definition of a single English word. Keyless and CORS-
 * enabled. Returns null for phrases, unknown words, or any network failure.
 */
export async function lookupDictionary(word: string, signal?: AbortSignal): Promise<WordDefinition | null> {
  const w = word.trim().toLowerCase().replace(/[^a-z'-]+/g, '');
  if (!w) return null;
  try {
    const raw = await fetchJson<Array<{
      word: string;
      phonetic?: string;
      phonetics?: Array<{ text?: string }>;
      meanings?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition: string; example?: string }> }>;
    }>>(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`,
      { ttlMs: 7 * 24 * 60 * 60 * 1000, cacheKey: `dict:${w}`, signal },
    );
    const entry = raw?.[0];
    const meaning = entry?.meanings?.find((m) => m.definitions?.length);
    const def = meaning?.definitions?.[0];
    if (!entry || !def?.definition) return null;
    return {
      word: entry.word || w,
      phonetic: entry.phonetic || entry.phonetics?.find((p) => p.text)?.text,
      partOfSpeech: meaning?.partOfSpeech,
      definition: def.definition,
      example: def.example,
    };
  } catch {
    return null;
  }
}

// ---------- Currency (ExchangeRate open endpoint) ----------

export interface CurrencyConversion {
  amount: number;
  from: string;
  to: string;
  rate: number;
  result: number;
}

/**
 * Convert an amount between two ISO-4217 currency codes using the keyless
 * open.er-api.com endpoint. Rates are cached per base for an hour. Returns null
 * for unknown codes or any failure. Codes are normalised to upper-case.
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<CurrencyConversion | null> {
  const base = from.trim().toUpperCase();
  const quote = to.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote) || !Number.isFinite(amount)) return null;
  try {
    const raw = await fetchJson<{ result?: string; rates?: Record<string, number> }>(
      `https://open.er-api.com/v6/latest/${base}`,
      { ttlMs: 60 * 60 * 1000, cacheKey: `fx:${base}`, signal },
    );
    const rate = raw.rates?.[quote];
    if (raw.result === 'error' || typeof rate !== 'number') return null;
    return { amount, from: base, to: quote, rate, result: amount * rate };
  } catch {
    return null;
  }
}
