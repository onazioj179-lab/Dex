// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { parseCsv, toCsv } from '../../../shared/format/csv';

export const LEDGER_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'] as const;
export type LedgerCurrency = typeof LEDGER_CURRENCIES[number];
export type LedgerKind = 'income' | 'expense';

export interface LedgerEntry {
  date: string;
  kind: LedgerKind;
  currency: LedgerCurrency;
  amountMinor: number;
  category: string;
  description: string;
}

export interface LedgerRow extends LedgerEntry {
  id: number;
  revision: number;
}

export interface LedgerQuery {
  currency: LedgerCurrency;
  month: string;
  search: string;
  offset: number;
}

export interface LedgerPage {
  entries: LedgerRow[];
  count: number;
  offset: number;
  pageSize: number;
  incomeMinor: string;
  expenseMinor: string;
  categories: Array<{ name: string; amountMinor: string }>;
}

const MAX_AMOUNT = 9_000_000_000_000n;
const HEADERS = ['date', 'kind', 'amount', 'currency', 'category', 'description'];
const cents = (currency: LedgerCurrency) => currency === 'JPY' ? 0 : 2;

export function parseLedgerAmount(text: string, currency: LedgerCurrency): number {
  const decimals = cents(currency);
  const raw = text.trim();
  const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match || (match[2]?.length ?? 0) > decimals) {
    throw new Error(decimals ? 'Enter a positive amount with up to two decimal places.' : 'Enter a positive whole amount.');
  }
  const minor = BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((match[2] ?? '').padEnd(decimals, '0') || '0');
  if (minor <= 0n || minor > MAX_AMOUNT) {
    throw new Error('Enter an amount greater than zero within the supported range.');
  }
  return Number(minor);
}

export function decimalLedgerAmount(amount: bigint, currency: LedgerCurrency): string {
  const decimals = cents(currency);
  const digits = (amount < 0n ? -amount : amount).toString().padStart(decimals + 1, '0');
  const formatted = decimals ? digits.slice(0, -decimals) + '.' + digits.slice(-decimals) : digits;
  return amount < 0n ? '-' + formatted : formatted;
}

const formatters = new Map<LedgerCurrency, Intl.NumberFormat>();
const digitFormatter = new Intl.NumberFormat(undefined, { useGrouping: false });
const localizedDigits = Array.from({ length: 10 }, (_, digit) => digitFormatter.format(digit));
export function formatLedgerAmount(minor: string | number | bigint, currency: LedgerCurrency): string {
  const amount = BigInt(minor);
  const decimals = cents(currency);
  const formatter = formatters.get(currency) ?? new Intl.NumberFormat(undefined, {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
  formatters.set(currency, formatter);
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount < 0n ? -amount % scale : amount % scale).toString().padStart(decimals, '0');
  const display = formatter.formatToParts(amount < 0n && whole === 0n ? -0 : whole);
  // The whole part stays a BigInt so totals above Number.MAX_SAFE_INTEGER remain exact.
  return display.map(part => part.type === 'fraction'
    ? fraction.replace(/[0-9]/g, digit => localizedDigits[Number(digit)])
    : part.value).join('');
}

export function localLedgerDate(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

const quotedFormula = /^['=+\-@\t\r]/;
const safeText = (text: string) => quotedFormula.test(text) ? "'" + text : text;
const restoreText = (text: string) => text.startsWith("'") && quotedFormula.test(text.slice(1)) ? text.slice(1) : text;

export function ledgerCsv(entries: readonly LedgerEntry[]): string {
  return toCsv([HEADERS, ...entries.map(entry => [
    entry.date, entry.kind, decimalLedgerAmount(BigInt(entry.amountMinor), entry.currency), entry.currency,
    safeText(entry.category), safeText(entry.description),
  ])]);
}

export function readLedgerCsv(csv: string): LedgerEntry[] {
  const [header, ...rows] = parseCsv(csv.replace(/^\ufeff/, ''));
  const columns = header?.map(cell => cell.trim().toLowerCase()) ?? [];
  const indices = HEADERS.map(header => columns.indexOf(header));
  if (columns.length !== HEADERS.length || indices.includes(-1)) {
    throw new Error('Use the columns date, kind, amount, currency, category, and description.');
  }
  const entries: LedgerEntry[] = [];
  for (const [i, row] of rows.entries()) {
    if (row.every(cell => !cell.trim())) continue;
    if (row.length !== columns.length) throw new Error('Transaction row ' + (i + 2) + ' has the wrong number of columns.');
    const [date, kind, amount, currency, category, description] = indices.map(index => row[index].trim());
    if (kind !== 'income' && kind !== 'expense') throw new Error('Transaction row ' + (i + 2) + ' needs an income or expense type.');
    if (!LEDGER_CURRENCIES.includes(currency as LedgerCurrency)) {
      throw new Error('Transaction row ' + (i + 2) + ' has an unsupported currency.');
    }
    try {
      const code = currency as LedgerCurrency;
      entries.push({ date, kind, currency: code, amountMinor: parseLedgerAmount(amount, code),
        category: restoreText(category), description: restoreText(description) });
    } catch (error) {
      throw new Error('Transaction row ' + (i + 2) + '. ' + (error instanceof Error ? error.message : 'Invalid amount.'));
    }
  }
  if (!entries.length) throw new Error('The CSV contains no transactions.');
  if (entries.length > 5000) throw new Error('Import up to 5,000 transactions at a time.');
  return entries;
}
