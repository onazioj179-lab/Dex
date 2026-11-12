// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { editableFields, nextField, inlineAmount, inlinePatch, amountDraft } from '../../src/renderer/DEXAPPLICATIONS/ledger/inlineEdit';
import type { Txn } from '../../src/renderer/DEXAPPLICATIONS/ledger/ledgerApi';

const txn = (o: Partial<Txn> = {}): Txn => ({
  id: 7, accountId: 1, accountName: 'Checking', date: '2026-11-10', payee: 'Grocer', memo: '', amount: -4250,
  categoryId: 3, categoryName: 'Food', groupName: 'Living', categoryKind: 'expense', status: 'uncleared',
  isTransfer: false, transferAccountId: null, transferAccountName: null, transferPeerId: null,
  isSplit: false, splitCount: 0, attachmentCount: 0, reconciliationId: null, ...o,
});

describe('ledger in-table editing', () => {
  it('editable cells depend on the row type', () => {
    expect(editableFields(txn())).toEqual(['date', 'payee', 'category', 'amount']);
    expect(editableFields(txn({ isTransfer: true }))).toEqual(['date', 'amount']);
    expect(editableFields(txn({ isSplit: true }))).toEqual(['date', 'payee']);
  });

  it('Tab order wraps both ways and skips cells the row lacks', () => {
    expect(nextField(txn(), 'amount')).toBe('date');
    expect(nextField(txn(), 'date', true)).toBe('amount');
    expect(nextField(txn({ isTransfer: true }), 'date')).toBe('amount');
    expect(nextField(txn({ isTransfer: true }), 'payee')).toBeNull();
  });

  it('a bare amount keeps the row direction; a sign overrides it; transfers never flip', () => {
    expect(inlineAmount('12.50', -4250, 2, false, '.')).toEqual({ ok: true, minor: -1250 });
    expect(inlineAmount('12.50', 900, 2, false, '.')).toEqual({ ok: true, minor: 1250 });
    expect(inlineAmount('+12.50', -4250, 2, false, '.')).toEqual({ ok: true, minor: 1250 });
    expect(inlineAmount('-3', 900, 2, false, '.')).toEqual({ ok: true, minor: -300 });
    expect(inlineAmount('(3)', 900, 2, false, '.')).toEqual({ ok: true, minor: -300 });
    expect(inlineAmount('+50', -100, 2, true, '.')).toEqual({ ok: true, minor: -5000 });
    expect(inlineAmount('0', -100, 2, false, '.').ok).toBe(false);
    expect(inlineAmount('abc', -100, 2, false, '.').ok).toBe(false);
    expect(inlineAmount('1.234', -100, 2, false, '.').ok).toBe(false);
    expect(inlineAmount('1500', -100, 0, false, '.')).toEqual({ ok: true, minor: -1500 });
  });

  it('patches are minimal and unchanged cells send nothing', () => {
    const t = txn();
    expect(inlinePatch(t, 'payee', '  Grocer ', 2, '.')).toEqual({ ok: true, patch: null });
    expect(inlinePatch(t, 'payee', 'Market', 2, '.')).toEqual({ ok: true, patch: { payee: 'Market' } });
    expect(inlinePatch(t, 'date', '2026-11-10', 2, '.')).toEqual({ ok: true, patch: null });
    expect(inlinePatch(t, 'date', '2026-11-09', 2, '.')).toEqual({ ok: true, patch: { date: '2026-11-09' } });
    expect(inlinePatch(t, 'date', '11/09/2026', 2, '.').ok).toBe(false);
    expect(inlinePatch(t, 'category', '3', 2, '.')).toEqual({ ok: true, patch: null });
    expect(inlinePatch(t, 'category', '', 2, '.')).toEqual({ ok: true, patch: { categoryId: null } });
    expect(inlinePatch(t, 'category', '5', 2, '.')).toEqual({ ok: true, patch: { categoryId: 5 } });
    expect(inlinePatch(t, 'amount', '42.50', 2, '.')).toEqual({ ok: true, patch: null });
    expect(inlinePatch(t, 'amount', '40', 2, '.')).toEqual({ ok: true, patch: { amount: -4000 } });
  });

  it('refuses cells the row cannot edit in place', () => {
    expect(inlinePatch(txn({ isTransfer: true }), 'category', '5', 2, '.').ok).toBe(false);
    expect(inlinePatch(txn({ isSplit: true }), 'amount', '1', 2, '.').ok).toBe(false);
  });

  it('amount draft is the plain magnitude in the locale separator', () => {
    expect(amountDraft(-4250, 2, '.')).toBe('42.50');
    expect(amountDraft(-4250, 2, ',')).toBe('42,50');
    expect(amountDraft(1500, 0, '.')).toBe('1500');
    expect(inlinePatch(txn(), 'amount', amountDraft(-4250, 2, ','), 2, ',')).toEqual({ ok: true, patch: null });
  });
});
