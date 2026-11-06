// =============================================================================
// DEX Platform — DEX Ledger money helpers
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Amounts are integer minor units end to end (the native engine stores i64).
// These helpers turn them into text and back WITHOUT binary floating point:
// formatting builds a decimal string from integer division, and parsing reads
// digits one by one.

/** "-1234.56" for (−123456, 2). Exact for any safe integer. */
export function minorToDecimalString(minor: number, digits: number): string {
  if (!Number.isSafeInteger(minor)) return '0';
  const neg = minor < 0;
  const abs = Math.abs(minor);
  if (digits <= 0) return `${neg ? '-' : ''}${abs}`;
  const scale = 10 ** digits;
  const whole = Math.floor(abs / scale);
  const frac = abs % scale;
  return `${neg ? '-' : ''}${whole}.${String(frac).padStart(digits, '0')}`;
}

const formatterCache = new Map<string, Intl.NumberFormat>();
function formatter(currency: string, digits: number, sign: boolean): Intl.NumberFormat {
  const key = `${currency}|${digits}|${sign}`;
  let f = formatterCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
        signDisplay: sign ? 'exceptZero' : 'auto',
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: sign ? 'exceptZero' : 'auto' });
    }
    formatterCache.set(key, f);
  }
  return f;
}

/**
 * Locale-formatted currency text. Intl accepts the exact decimal STRING
 * (Intl.NumberFormat v3), so no float conversion happens on the way.
 */
export function formatMoney(minor: number, currency: string, digits: number, opts: { sign?: boolean } = {}): string {
  const text = minorToDecimalString(minor, digits);
  try {
    // Intl.NumberFormat.format accepts decimal strings (StringNumericLiteral) in Chromium/WebView2.
    return formatter(currency, digits, !!opts.sign).format(text as unknown as number);
  } catch {
    return `${text} ${currency}`;
  }
}

export interface ParsedMoney { ok: true; minor: number }
export interface MoneyError { ok: false; error: string }

/** The user's locale decimal separator ("." or ","). */
export function localeDecimalSeparator(): '.' | ',' {
  try {
    const part = new Intl.NumberFormat().formatToParts(1.5).find(p => p.type === 'decimal');
    return part?.value === ',' ? ',' : '.';
  } catch {
    return '.';
  }
}

/**
 * Parse what someone typed into an amount field. Accepts grouping, a leading
 * sign, a currency symbol, and the locale decimal separator (or "." when it is
 * unambiguous). Rejects more decimals than the currency has — never rounds.
 */
export function parseMoneyInput(input: string, digits: number, decimal: '.' | ',' = localeDecimalSeparator()): ParsedMoney | MoneyError {
  let s = input.trim();
  if (!s) return { ok: false, error: 'Enter an amount' };
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s  '_]/g, '').replace(/[^\d.,+\-−]/g, '');
  if (/^[-−]/.test(s)) { neg = !neg; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (/[-−+]/.test(s)) return { ok: false, error: 'Use one sign at the start' };
  if (!/\d/.test(s)) return { ok: false, error: 'Enter an amount' };
  // Work out which mark is the decimal separator.
  let dec: string | null = null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) dec = lastDot > lastComma ? '.' : ',';
  else if (lastDot >= 0 || lastComma >= 0) {
    const mark = lastDot >= 0 ? '.' : ',';
    const count = s.split(mark).length - 1;
    const after = s.length - s.lastIndexOf(mark) - 1;
    // "1,234" with a 3-digit tail and a "." locale is grouping, not decimals.
    dec = count === 1 && !(mark !== decimal && after === 3) ? mark : null;
  }
  const [wholeRaw, fracRaw = ''] = dec ? [s.slice(0, s.lastIndexOf(dec)), s.slice(s.lastIndexOf(dec) + 1)] : [s, ''];
  const whole = wholeRaw.replace(/[.,]/g, '');
  if (/[.,]/.test(fracRaw)) return { ok: false, error: 'That amount has too many separators' };
  let frac = fracRaw;
  if (frac.length > digits) {
    if (/[1-9]/.test(frac.slice(digits))) return { ok: false, error: digits === 0 ? 'This currency has no decimal places' : `Use at most ${digits} decimal places` };
    frac = frac.slice(0, digits);
  }
  frac = frac.padEnd(digits, '0');
  const text = `${whole || '0'}${frac}`.replace(/^0+(?=\d)/, '');
  if (text.length > 15) return { ok: false, error: 'That amount is too large' };
  const minor = Number(text);
  if (!Number.isSafeInteger(minor)) return { ok: false, error: 'That amount is too large' };
  return { ok: true, minor: neg ? -minor : minor };
}

/** Today's LOCAL calendar date as YYYY-MM-DD. */
export function todayLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthOf(date: string): string { return date.slice(0, 7); }

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

export function formatMonth(month: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(undefined, { month: style, year: 'numeric' }).format(new Date(y, m - 1, 1));
  } catch { return month; }
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d));
  } catch { return date; }
}

/** Day-first or month-first, from the user's locale (used when a CSV is ambiguous). */
export function localeDateOrder(): 'dmy' | 'mdy' {
  try {
    const parts = new Intl.DateTimeFormat().formatToParts(new Date(2026, 10, 22));
    const order = parts.filter(p => p.type === 'day' || p.type === 'month').map(p => p.type);
    return order[0] === 'month' ? 'mdy' : 'dmy';
  } catch { return 'dmy'; }
}

/** A sensible default currency from the locale's region, for the setup screen only. */
export function guessCurrency(): string {
  const region = (() => {
    try { return new Intl.Locale(navigator.language).maximize().region || ''; } catch { return ''; }
  })();
  const map: Record<string, string> = {
    US: 'USD', GB: 'GBP', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR',
    NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', EG: 'EGP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', JP: 'JPY', CN: 'CNY', KR: 'KRW',
    BR: 'BRL', MX: 'MXN', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', AE: 'AED', SA: 'SAR', SG: 'SGD', HK: 'HKD', TR: 'TRY',
  };
  return map[region] || 'USD';
}

export const CURRENCIES: string[] = [
  'USD', 'EUR', 'GBP', 'NGN', 'GHS', 'KES', 'ZAR', 'EGP', 'CAD', 'AUD', 'NZD', 'INR', 'JPY', 'CNY', 'KRW', 'BRL', 'MXN',
  'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'SGD', 'HKD', 'TRY', 'ILS', 'THB', 'IDR', 'PHP', 'VND', 'MAD', 'XOF', 'XAF',
];

/** ISO 4217 minor-unit exponent (mirrors the native engine). */
export function currencyDigits(code: string): number {
  if (['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'].includes(code)) return 0;
  if (['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'].includes(code)) return 3;
  return 2;
}
