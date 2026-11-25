// =============================================================================
// DEX Platform — DEX Ledger change-history wording
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { describeAudit, type AuditNames } from '../../src/renderer/DEXAPPLICATIONS/ledger/auditText';
import { minorToDecimalString } from '../../src/renderer/DEXAPPLICATIONS/ledger/money';
import type { AuditEntry } from '../../src/renderer/DEXAPPLICATIONS/ledger/ledgerApi';

const names: AuditNames = {
  fmt: (m, o) => `${o?.sign && m > 0 ? '+' : ''}${minorToDecimalString(m, 2)}`,
  account: (id) => ({ 1: 'Checking', 2: 'Savings' } as Record<number, string>)[id],
  category: (id) => ({ 10: 'Groceries', 11: 'Rent' } as Record<number, string>)[id],
};

const row = (action: string, entity: string, entityId: number | null, detail: unknown): AuditEntry =>
  ({ id: 1, ts: 0, action, entity, entityId, detail });

describe('ledger audit wording', () => {
  it('describes a new transaction from the engine detail, never raw JSON', () => {
    const t = describeAudit(row('create', 'transaction', 7, { accountId: 1, date: '2026-11-02', amount: -4250, payee: 'Market', categoryId: 10, splitLines: null }), names);
    expect(t.title).toBe('Transaction added: Market');
    expect(t.detail).toBe('-42.50 · 2026-11-02 · Checking · Groceries');
    expect(t.detail).not.toContain('{');
  });

  it('names both sides of a transfer and money moved between categories', () => {
    expect(describeAudit(row('create', 'transfer', 3, { from: 1, to: 2, amount: 10000, date: '2026-11-05', peer: 4 }), names))
      .toEqual({ title: 'Transfer of 100.00', detail: 'Checking → Savings · 2026-11-05' });
    expect(describeAudit(row('move', 'budget', null, { month: '2026-11', from: null, to: 11, amount: 5000 }), names))
      .toEqual({ title: 'Moved 50.00', detail: '2026-11 · To assign → Rent' });
  });

  it('uses the snapshot of a deleted transaction', () => {
    const t = describeAudit(row('delete', 'transaction', 9, { payee: 'Cafe', amount: -350, date: '2026-10-30', accountName: 'Checking' }), names);
    expect(t).toEqual({ title: 'Transaction deleted: Cafe', detail: '-3.50 · 2026-10-30 · Checking' });
  });

  it('lists changed fields in words', () => {
    expect(describeAudit(row('update', 'transaction', 5, { payee: 'X', amount: -1, categoryId: 10 }), names).detail)
      .toBe('Changed description, amount, category');
    expect(describeAudit(row('update', 'account', 1, { name: 'Main' }), names))
      .toEqual({ title: 'Account edited: Checking', detail: 'Changed name' });
  });

  it('counts bulk changes and budget assignments', () => {
    expect(describeAudit(row('status', 'transaction', null, { ids: [1, 2, 3], status: 'cleared' }), names).title).toBe('Marked 3 transactions cleared');
    expect(describeAudit(row('categorize', 'transaction', null, { ids: [4], categoryId: 11 }), names))
      .toEqual({ title: 'Categorised 1 transaction', detail: 'Rent' });
    expect(describeAudit(row('assign', 'category', 10, { month: '2026-11', from: 0, to: 30000 }), names))
      .toEqual({ title: 'Budget set for Groceries', detail: '2026-11 · 0.00 → 300.00' });
  });

  it('leaves out what it does not know instead of inventing it', () => {
    // A deleted account id no longer resolves to a name.
    expect(describeAudit(row('archive', 'account', 99, {}), names)).toEqual({ title: 'Account archived', detail: '' });
    // Unknown pairs fall back to their own words.
    expect(describeAudit(row('compact', 'ledger', null, { x: 1 }), names)).toEqual({ title: 'Compact ledger', detail: '' });
    // Missing or malformed detail never throws.
    expect(describeAudit(row('create', 'transaction', 1, null), names)).toEqual({ title: 'Transaction added: no description', detail: '' });
  });

  it('words currency changes and imports', () => {
    expect(describeAudit(row('update', 'settings', null, { currency: { from: 'USD', to: 'EUR' } }), names))
      .toEqual({ title: 'Currency changed', detail: 'USD → EUR' });
    expect(describeAudit(row('import', 'account', 1, { imported: 12, skipped: 2, backup: 'x.db' }), names))
      .toEqual({ title: 'CSV imported into Checking', detail: '12 transactions added · 2 skipped' });
  });
});
