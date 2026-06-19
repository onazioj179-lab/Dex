// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Answer Engine (DEX 5.6 Priority 1 — UKI Intelligence).
 *
 * The bridge between a free-form question and the keyless public APIs in
 * `freeApis.ts`. It does two jobs:
 *
 *   1. Classify a question into the knowledge capability it needs
 *      (weather / define / currency / time / lookup) — pure + deterministic,
 *      so it is cheap to gate on and fully unit-testable.
 *   2. Run the matching API and format a clear, single-paragraph English answer
 *      with a source label — what UKI says back, or folds into the LLM prompt as
 *      grounding so a configured model answers with current facts instead of
 *      stale training data.
 *
 * This is the wiring that turns the long-orphaned `freeApis` module into a real
 * capability: UKI can now answer "what's the weather in Tokyo", "define
 * ephemeral", "convert 100 usd to eur", or "who is Ada Lovelace" inline — with
 * no API key, and offline from cache when the network is down.
 */

import {
  searchWikipedia,
  lookupWeather,
  lookupDictionary,
  convertCurrency,
  lookupWorldTime,
  lookupInstantAnswer,
  weatherCodeToText,
} from './freeApis';

export type KnowledgeIntent = 'weather' | 'define' | 'currency' | 'time' | 'lookup' | 'none';

export interface KnowledgeAnswer {
  /** Clear, ready-to-speak English answer. */
  text: string;
  /** Human-readable provenance, e.g. "Wikipedia" or "Open-Meteo". */
  sourceLabel?: string;
  /** Canonical URL for the source, when one exists. */
  sourceUrl?: string;
  /** The capability that produced the answer (useful for telemetry/UI). */
  intent: KnowledgeIntent;
}

// ---------------------------------------------------------------------------
// Intent classification — pure, ordered most-specific first.
// ---------------------------------------------------------------------------

const WEATHER_RE = /\b(weather|forecast|temperature|how (?:hot|cold|warm)|is it (?:raining|sunny|snowing))\b/i;
const DEFINE_RE = /^\s*(?:define|definition of|what does|meaning of)\b|\bmean(?:s|ing)?\??\s*$/i;
const CURRENCY_RE = /\b(\d[\d,.]*)\s*([a-z]{3}|dollars?|euros?|pounds?|yen|rupees?|francs?|pesos?|won|yuan|rand|reais?|real)\b[\s\w]*?\b(?:to|in|into|as)\b\s*([a-z]{3}|dollars?|euros?|pounds?|yen|rupees?|francs?|pesos?|won|yuan|rand|reais?|real)\b/i;
const TIME_RE = /\b(?:what(?:'?s| is)\s+the\s+)?time\b[\s\w]*\b(?:in|at)\b\s+([a-z][\w/ -]+)$/i;
const LOOKUP_RE = /^\s*(?:who(?:'?s| is| was| are)|what(?:'?s| is| was| are)|tell me about|info on|information on)\b/i;

/**
 * Map a question to the knowledge capability it needs. Order matters — a weather
 * or currency question that also opens with "what is" must win over the generic
 * "lookup" path. Returns 'none' for anything this engine should not handle (it
 * then falls through to the LLM / web-search routes).
 */
export function classifyKnowledgeIntent(query: string): KnowledgeIntent {
  const q = (query ?? '').trim();
  if (!q) return 'none';
  if (WEATHER_RE.test(q)) return 'weather';
  if (CURRENCY_RE.test(q)) return 'currency';
  if (TIME_RE.test(q)) return 'time';
  if (DEFINE_RE.test(q)) return 'define';
  if (LOOKUP_RE.test(q)) return 'lookup';
  return 'none';
}

// ---------------------------------------------------------------------------
// Extractors — pull the API argument out of the phrasing. Pure + exported so the
// parsing is unit-testable without touching the network.
// ---------------------------------------------------------------------------

/** Common spoken currency names → ISO-4217 code. Codes pass straight through. */
const CURRENCY_WORDS: Record<string, string> = {
  dollar: 'USD', dollars: 'USD', usd: 'USD', buck: 'USD', bucks: 'USD',
  euro: 'EUR', euros: 'EUR', eur: 'EUR',
  pound: 'GBP', pounds: 'GBP', sterling: 'GBP', gbp: 'GBP',
  yen: 'JPY', jpy: 'JPY',
  rupee: 'INR', rupees: 'INR', inr: 'INR',
  franc: 'CHF', francs: 'CHF', chf: 'CHF',
  peso: 'MXN', pesos: 'MXN',
  won: 'KRW', krw: 'KRW',
  yuan: 'CNY', renminbi: 'CNY', cny: 'CNY',
  rand: 'ZAR', zar: 'ZAR',
  real: 'BRL', reais: 'BRL', brl: 'BRL',
  cad: 'CAD', aud: 'AUD', nzd: 'NZD',
};

function toCurrencyCode(token: string): string | null {
  const t = token.trim().toLowerCase();
  if (/^[a-z]{3}$/.test(t)) return CURRENCY_WORDS[t] ?? t.toUpperCase();
  return CURRENCY_WORDS[t] ?? null;
}

/** Extract a place name from a weather question, or null if none is given. */
export function extractWeatherPlace(query: string): string | null {
  const q = query.trim();
  // "weather in X", "forecast for X", "how hot is it in X"
  const inMatch = q.match(/\b(?:in|for|at)\s+([a-z][\w'.,\- ]+?)\s*\??$/i);
  if (inMatch) return cleanPlace(inMatch[1]);
  // "X weather" / "X forecast"
  const leadMatch = q.match(/^([a-z][\w'.,\- ]+?)\s+(?:weather|forecast|temperature)\b/i);
  if (leadMatch) return cleanPlace(leadMatch[1]);
  return null;
}

function cleanPlace(s: string): string | null {
  const out = s
    .replace(/\b(what'?s?|how|is|it|the|today|now|right now|currently|please)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out.length >= 2 ? out : null;
}

/** Extract the single word to define, or null. */
export function extractDefineWord(query: string): string | null {
  const q = query.trim();
  let m = q.match(/^(?:define|definition of|meaning of)\s+([a-z][a-z'-]*)/i);
  if (m) return m[1].toLowerCase();
  m = q.match(/^what does\s+([a-z][a-z'-]*)\s+mean/i);
  if (m) return m[1].toLowerCase();
  return null;
}

/** Extract { amount, from, to } from a conversion question, or null. */
export function extractCurrency(query: string): { amount: number; from: string; to: string } | null {
  const m = query.match(CURRENCY_RE);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ''));
  const from = toCurrencyCode(m[2]);
  const to = toCurrencyCode(m[3]);
  if (!Number.isFinite(amount) || !from || !to) return null;
  return { amount, from, to };
}

/** Extract an IANA timezone or a known city for a "time in X" question, or null. */
export function extractTimezone(query: string): string | null {
  const m = query.match(TIME_RE);
  if (!m) return null;
  const place = m[1].trim().replace(/\?+$/, '').trim();
  if (!place) return null;
  // Already an IANA zone ("Europe/London")?
  if (/^[a-z_]+\/[a-z_]+/i.test(place)) {
    return place.split(' ')[0];
  }
  const key = place.toLowerCase().replace(/\s+/g, '_');
  return CITY_TIMEZONES[key] ?? null;
}

/** A pragmatic city → IANA zone table for the most-asked locations. */
const CITY_TIMEZONES: Record<string, string> = {
  london: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin', madrid: 'Europe/Madrid',
  rome: 'Europe/Rome', moscow: 'Europe/Moscow', dubai: 'Asia/Dubai', tokyo: 'Asia/Tokyo',
  beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', singapore: 'Asia/Singapore', hong_kong: 'Asia/Hong_Kong',
  mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', new_delhi: 'Asia/Kolkata', sydney: 'Australia/Sydney',
  new_york: 'America/New_York', nyc: 'America/New_York', chicago: 'America/Chicago', denver: 'America/Denver',
  los_angeles: 'America/Los_Angeles', la: 'America/Los_Angeles', san_francisco: 'America/Los_Angeles',
  toronto: 'America/Toronto', sao_paulo: 'America/Sao_Paulo', lagos: 'Africa/Lagos', cairo: 'Africa/Cairo',
  johannesburg: 'Africa/Johannesburg', nairobi: 'Africa/Nairobi', auckland: 'Pacific/Auckland',
};

/** Extract the topic for a "who is / what is / tell me about X" question. */
export function extractLookupTopic(query: string): string | null {
  const q = query.trim().replace(/\?+$/, '').trim();
  const m = q.match(/^(?:who(?:'?s| is| was| are)|what(?:'?s| is| was| are)|tell me about|info(?:rmation)? on)\s+(.+)$/i);
  if (!m) return null;
  const topic = m[1].replace(/^(?:a|an|the)\s+/i, '').trim();
  return topic.length >= 2 ? topic : null;
}

// ---------------------------------------------------------------------------
// Answer — run the matching API and format clear English.
// ---------------------------------------------------------------------------

function firstSentences(text: string, max = 2, cap = 360): string {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+/g);
  let out = sentences ? sentences.slice(0, max).join(' ').trim() : text.trim();
  if (out.length > cap) out = out.slice(0, cap - 1).trimEnd() + '…';
  return out;
}

/**
 * Answer a factual question from the free public APIs. Returns a clear English
 * answer with provenance, or null when the question isn't a knowledge query or
 * no source could answer it (the caller then degrades to the LLM / web search).
 */
export async function answerFactualQuestion(query: string, signal?: AbortSignal): Promise<KnowledgeAnswer | null> {
  const intent = classifyKnowledgeIntent(query);
  switch (intent) {
    case 'weather': {
      const place = extractWeatherPlace(query);
      if (!place) return null;
      const wx = await lookupWeather(place, signal);
      if (!wx) return null;
      return {
        intent,
        text: `It's ${Math.round(wx.temperatureC)}°C and ${weatherCodeToText(wx.weatherCode)} in ${wx.locationName}, with winds around ${Math.round(wx.windKph)} km/h.`,
        sourceLabel: 'Open-Meteo',
        sourceUrl: 'https://open-meteo.com',
      };
    }
    case 'currency': {
      const c = extractCurrency(query);
      if (!c) return null;
      const conv = await convertCurrency(c.amount, c.from, c.to, signal);
      if (!conv) return null;
      const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
      return {
        intent,
        text: `${fmt(conv.amount)} ${conv.from} = ${fmt(conv.result)} ${conv.to} (1 ${conv.from} = ${conv.rate.toFixed(4)} ${conv.to}).`,
        sourceLabel: 'ExchangeRate-API',
        sourceUrl: 'https://www.exchangerate-api.com',
      };
    }
    case 'time': {
      const tz = extractTimezone(query);
      if (!tz) return null;
      const t = await lookupWorldTime(tz, signal);
      if (!t) return null;
      const clock = t.datetime.slice(11, 16);
      return {
        intent,
        text: `It's ${clock} in ${t.timezone.replace(/_/g, ' ')} (UTC${t.utcOffset.slice(0, 6)}).`,
        sourceLabel: 'WorldTimeAPI',
        sourceUrl: 'https://worldtimeapi.org',
      };
    }
    case 'define': {
      const word = extractDefineWord(query);
      if (!word) return null;
      const d = await lookupDictionary(word, signal);
      if (!d) return null;
      const pos = d.partOfSpeech ? ` (${d.partOfSpeech})` : '';
      const phon = d.phonetic ? ` ${d.phonetic}` : '';
      const ex = d.example ? ` For example: "${d.example}".` : '';
      return {
        intent,
        text: `${d.word}${phon}${pos}: ${d.definition}${ex}`,
        sourceLabel: 'Free Dictionary',
        sourceUrl: 'https://dictionaryapi.dev',
      };
    }
    case 'lookup': {
      const topic = extractLookupTopic(query);
      if (!topic) return null;
      const wiki = await searchWikipedia(topic, signal);
      if (wiki?.extract) {
        return {
          intent,
          text: firstSentences(wiki.extract),
          sourceLabel: 'Wikipedia',
          sourceUrl: wiki.contentUrl,
        };
      }
      const ia = await lookupInstantAnswer(topic, signal);
      if (ia?.abstract) {
        return {
          intent,
          text: firstSentences(ia.abstract),
          sourceLabel: ia.abstractSource || 'DuckDuckGo',
          sourceUrl: ia.abstractURL,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * One-line grounding string for the LLM prompt, e.g.
 *   "It's 18°C and clear in Tokyo, Japan… (source: Open-Meteo)"
 * Returns null when there is nothing to ground with.
 */
export function groundingLine(answer: KnowledgeAnswer): string {
  return answer.sourceLabel ? `${answer.text} (source: ${answer.sourceLabel})` : answer.text;
}
