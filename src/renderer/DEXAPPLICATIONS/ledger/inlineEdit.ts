// =============================================================================
// DEX Platform — DEX Ledger in-table editing rules
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Pure rules for editing a transaction straight in the table: which cells can
// be edited for which row, how a typed amount keeps its direction, and the
// smallest update to send. The engine still validates everything.

import type { Txn } from './ledgerApi';
import { parseMoneyInput, minorToDecimalString, localeDecimalSeparator } from './money';

export type InlineField = 'date' | 'payee' | 'category' | 'amount';
export const INLINE_ORDER: InlineField[] = ['date', 'payee', 'category', 'amount'];

/**
 * Cells a row allows in the table. Transfers have no payee or category (the
 * other account is the description). A split's category and total live in its
 * lines, so those open the full editor instead.
 */
export function editableFields(t: Pick<Txn, 'isTransfer' | 'isSplit'>): InlineField[] {
  if (t.isTransfer) return ['date', 'amount'];
  if (t.isSplit) return ['date', 'payee'];
  return INLINE_ORDER;
}

/** Next (or previous) editable cell in the row, wrapping; null if none other. */
export function nextField(t: Pick<Txn, 'isTransfer' | 'isSplit'>, from: InlineField, back = false): InlineField | null {
  const f = editableFields(t);
  const i = f.indexOf(from);
  if (f.length < 2 || i < 0) return null;
  return f[(i + (back ? f.length - 1 : 1)) % f.length];
}

export type InlineAmount = { ok: true; minor: number } | { ok: false; error: string };

/**
 * Amount typed in the table. A leading sign (or brackets) sets the direction;
 * a bare number keeps the row's direction, so retyping "12.50" on a purchase
 * stays money out. Transfers always keep their direction.
 */
export function inlineAmount(text: string, original: number, digits: number, isTransfer = false, decimal: '.' | ',' = localeDecimalSeparator()): InlineAmount {
  const p = parseMoneyInput(text, digits, decimal);
  if (!p.ok) return { ok: false, error: p.error };
  if (p.minor === 0) return { ok: false, error: 'Amount cannot be zero' };
  const explicit = /^\s*[-−+(]/.test(text);
  const out = original < 0 ? -1 : 1;
  if (isTransfer || !explicit) return { ok: true, minor: out * Math.abs(p.minor) };
  return { ok: true, minor: p.minor };
}

export type InlinePatch = { ok: true; patch: Record<string, unknown> | null } | { ok: false; error: string };

/**
 * The update for one edited cell, or `patch: null` when nothing changed.
 * `value` is the raw text (date/payee/amount) or a category id string ('' = none).
 */
export function inlinePatch(t: Txn, field: InlineField, value: string, digits: number, decimal: '.' | ',' = localeDecimalSeparator()): InlinePatch {
  if (!editableFields(t).includes(field)) return { ok: false, error: 'Open the full editor to change this' };
  switch (field) {
    case 'date': {
      const v = value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T00:00:00`).getTime())) return { ok: false, error: 'Enter a date' };
      return { ok: true, patch: v === t.date ? null : { date: v } };
    }
    case 'payee': {
      const v = value.trim();
      return { ok: true, patch: v === t.payee ? null : { payee: v } };
    }
    case 'category': {
      const id = value === '' ? null : Number(value);
      if (id !== null && !Number.isInteger(id)) return { ok: false, error: 'Choose a category' };
      return { ok: true, patch: id === t.categoryId ? null : { categoryId: id } };
    }
    case 'amount': {
      const a = inlineAmount(value, t.amount, digits, t.isTransfer, decimal);
      if (!a.ok) return a;
      return { ok: true, patch: a.minor === t.amount ? null : { amount: a.minor } };
    }
  }
}

/** Text the amount box starts with: the plain magnitude ("12.50"), direction kept by the row. */
export function amountDraft(minor: number, digits: number, decimal: '.' | ',' = localeDecimalSeparator()): string {
  const s = minorToDecimalString(Math.abs(minor), digits);
  return decimal === ',' ? s.replace('.', ',') : s;
}
