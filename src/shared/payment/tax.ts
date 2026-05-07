// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tax + currency utilities.
 *
 * INTENTIONAL STUB: The VAT_RATES table here is a small representative
 * set. Production billing relies on the upstream tax provider and
 * treats this file purely as a fallback for receipts during outages.
 */

// DEX v3.8.9 - tax + currency

/** ISO-3166 alpha-2 country code -> standard VAT rate as a fraction. */
export const VAT_RATES: Record<string, number> = {
  AT: 0.20, BE: 0.21, BG: 0.20, CY: 0.19, CZ: 0.21, DE: 0.19, DK: 0.25,
  EE: 0.22, ES: 0.21, FI: 0.255, FR: 0.20, GR: 0.24, HR: 0.25, HU: 0.27,
  IE: 0.23, IT: 0.22, LT: 0.21, LU: 0.17, LV: 0.21, MT: 0.18, NL: 0.21,
  PL: 0.23, PT: 0.23, RO: 0.19, SE: 0.25, SI: 0.22, SK: 0.23,
  GB: 0.20, NO: 0.25, CH: 0.077,
  US: 0,            // sales tax is regional; treat federal as zero
  CA: 0,            // GST/HST handled by provider
  AU: 0.10, NZ: 0.15, JP: 0.10, IN: 0.18,
};

export interface TaxOutcome {
  netMinor: number;       // pre-tax
  taxMinor: number;
  grossMinor: number;
  rate: number;
}

export function computeTax(netMinor: number, country: string): TaxOutcome {
  const rate = VAT_RATES[country.toUpperCase()] ?? 0;
  const taxMinor = Math.round(netMinor * rate);
  return { netMinor, taxMinor, grossMinor: netMinor + taxMinor, rate };
}

// ---------- currency ----------

/** Format a minor-unit amount with locale + currency code. */
export function formatCurrency(minor: number, code: string, locale: string = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
}

/** Convert one currency to another with a rate table (rate = how many target per 1 source). */
export function convertCurrency(amountMinor: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amountMinor;
  const key = `${from}-${to}`;
  const reverse = `${to}-${from}`;
  if (rates[key] !== undefined) return Math.round(amountMinor * rates[key]);
  if (rates[reverse] !== undefined && rates[reverse] !== 0) return Math.round(amountMinor / rates[reverse]);
  throw new Error(`No conversion rate for ${from} -> ${to}`);
}
