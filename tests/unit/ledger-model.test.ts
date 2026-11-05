// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  emptyLedger, parseAmount, formatMinor, addTransaction, addTransfer, updateTransaction, deleteTransaction,
  accountBalance, netWorth, monthSummary, budgetMonth, setBudget, reconcileState, finishReconcile,
  importTransactionsCsv, exportTransactionsCsv, csvParse, normalizeDate, validateLedger, deleteCategory,
  deleteAccount, addMonths, type LedgerDoc,
} from '../../src/renderer/DEXAPPLICATIONS/ledger/ledgerModel';

function base(): LedgerDoc {
  const d = emptyLedger('USD');
  d.accounts = [
    { id: 'chk', name: 'Checking', type: 'checking', openingMinor: 100_000, openingDate: '2026-01-01', closed: false },
    { id: 'sav', name: 'Savings', type: 'savings', openingMinor: 0, openingDate: '2026-01-01', closed: false },
  ];
  d.categories = [
    { id: 'sal', name: 'Salary', group: 'Income', kind: 'income', archived: false },
    { id: 'gro', name: 'Groceries', group: 'Everyday', kind: 'expense', archived: false },
    { id: 'din', name: 'Dining', group: 'Everyday', kind: 'expense', archived: false },
  ];
  return d;
}
const sp = (categoryId: string | null, amountMinor: number) => ({ categoryId, amountMinor, memo: '' });

describe('ledger — money parsing', () => {
  it('parses without float drift', () => {
    expect(parseAmount('0.1')).toBe(10);
    expect(parseAmount('1,234.56')).toBe(123456);
    expect(parseAmount('-12')).toBe(-1200);
    expect(parseAmount('(45.10)')).toBe(-4510);
    expect(parseAmount('$9.9')).toBe(990);
    expect(parseAmount('1.234')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
  it('formats', () => {
    expect(formatMinor(123456)).toBe('$1,234.56');
    expect(formatMinor(-5)).toBe('−$0.05');
    expect(formatMinor(100, 'EUR', { sign: true })).toBe('+€1.00');
  });
  it('month arithmetic', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });
});

describe('ledger — balances, splits and transfers', () => {
  it('split transaction totals and balances', () => {
    let d = addTransaction(base(), { date: '2026-01-05', accountId: 'chk', payee: 'Market', memo: '', splits: [sp('gro', -3000), sp('din', -1250)] });
    expect(accountBalance(d, 'chk')).toBe(100_000 - 4250);
    const s = monthSummary(d, '2026-01');
    expect(s.expenseMinor).toBe(4250);
    expect(s.byCategory.get('gro')).toBe(-3000);
    d = addTransaction(d, { date: '2026-01-31', accountId: 'chk', payee: 'Employer', memo: '', splits: [sp('sal', 250_000)] });
    expect(monthSummary(d, '2026-01').incomeMinor).toBe(250_000);
  });

  it('transfers move money but are neither income nor expense', () => {
    const d = addTransfer(base(), 'chk', 'sav', 20_000, '2026-01-10');
    expect(accountBalance(d, 'chk')).toBe(80_000);
    expect(accountBalance(d, 'sav')).toBe(20_000);
    expect(netWorth(d)).toBe(100_000);
    const s = monthSummary(d, '2026-01');
    expect(s.incomeMinor).toBe(0);
    expect(s.expenseMinor).toBe(0);
    expect(s.uncategorizedMinor).toBe(0);
    expect(() => addTransfer(base(), 'chk', 'chk', 1, '2026-01-10')).toThrow();
    expect(() => addTransfer(base(), 'chk', 'sav', 0, '2026-01-10')).toThrow();
  });

  it('editing a transfer leg mirrors the other leg; deleting removes both', () => {
    let d = addTransfer(base(), 'chk', 'sav', 20_000, '2026-01-10');
    const leg = d.transactions.find((t) => t.accountId === 'chk')!;
    d = updateTransaction(d, leg.id, { splits: [sp(null, -5_000)], date: '2026-01-11' });
    expect(accountBalance(d, 'sav')).toBe(5_000);
    expect(d.transactions.every((t) => t.date === '2026-01-11')).toBe(true);
    expect(() => updateTransaction(d, leg.id, { splits: [sp('gro', -5_000)] })).toThrow(/category/);
    d = deleteTransaction(d, leg.id);
    expect(d.transactions).toHaveLength(0);
  });

  it('refuses to delete used categories and accounts with history', () => {
    const d = addTransaction(base(), { date: '2026-01-05', accountId: 'chk', payee: '', memo: '', splits: [sp('gro', -100)] });
    expect(() => deleteCategory(d, 'gro')).toThrow(/Archive/);
    expect(() => deleteAccount(d, 'chk')).toThrow(/Close/);
    expect(deleteAccount(d, 'sav').accounts).toHaveLength(1);
  });
});

describe('ledger — budgets', () => {
  it('available carries over across months', () => {
    let d = setBudget(base(), '2026-01', 'gro', 30_000);
    d = setBudget(d, '2026-02', 'gro', 30_000);
    d = addTransaction(d, { date: '2026-01-05', accountId: 'chk', payee: '', memo: '', splits: [sp('gro', -25_000)] });
    d = addTransaction(d, { date: '2026-02-05', accountId: 'chk', payee: '', memo: '', splits: [sp('gro', -40_000)] });
    const jan = budgetMonth(d, '2026-01').rows.find((r) => r.categoryId === 'gro')!;
    expect(jan).toMatchObject({ budgetedMinor: 30_000, activityMinor: -25_000, availableMinor: 5_000 });
    const feb = budgetMonth(d, '2026-02').rows.find((r) => r.categoryId === 'gro')!;
    expect(feb).toMatchObject({ budgetedMinor: 30_000, activityMinor: -40_000, availableMinor: -5_000 });
    // Budgets never change account balances.
    expect(accountBalance(d, 'chk')).toBe(100_000 - 65_000);
    expect(setBudget(d, '2026-01', 'gro', 0).budgets).toHaveLength(1);
  });
});

describe('ledger — reconciliation', () => {
  it('locks cleared transactions only when the difference is zero', () => {
    let d = addTransaction(base(), { date: '2026-01-05', accountId: 'chk', payee: '', memo: '', splits: [sp('gro', -1000)], status: 1 });
    d = addTransaction(d, { date: '2026-01-06', accountId: 'chk', payee: '', memo: '', splits: [sp('gro', -500)] });
    expect(reconcileState(d, 'chk', 99_000)).toMatchObject({ clearedMinor: 99_000, differenceMinor: 0, pending: 1 });
    expect(() => finishReconcile(d, 'chk', 98_000)).toThrow(/off by/);
    d = finishReconcile(d, 'chk', 99_000);
    expect(d.transactions.map((t) => t.status)).toEqual([2, 0]);
    expect(() => updateTransaction(d, d.transactions[0].id, { splits: [sp('gro', -1)] })).toThrow(/reconciled/);
  });
});

describe('ledger — CSV and backup', () => {
  it('parses quoted CSV', () => {
    expect(csvParse('a,"b,c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b,c', 'say "hi"'], ['1', '2', '3']]);
  });
  it('normalizes dates and rejects impossible ones', () => {
    expect(normalizeDate('2026-1-5')).toBe('2026-01-05');
    expect(normalizeDate('01/02/2026', 'mdy')).toBe('2026-01-02');
    expect(normalizeDate('01/02/2026', 'dmy')).toBe('2026-02-01');
    expect(normalizeDate('02/30/2026')).toBeNull();
  });
  it('imports amount and debit/credit layouts, reporting bad lines', () => {
    const a = importTransactionsCsv('Date,Description,Amount\n2026-01-05,Market,-42.50\nbad,x,1\n2026-01-06,Pay,"1,000.00"\n');
    expect(a.rows.map((r) => r.amountMinor)).toEqual([-4250, 100000]);
    expect(a.errors).toEqual(['Line 3: unreadable date "bad".']);
    const b = importTransactionsCsv('Posted Date,Payee,Debit,Credit\n01/05/2026,Shop,12.00,\n01/06/2026,Refund,,3.5\n');
    expect(b.rows.map((r) => r.amountMinor)).toEqual([-1200, 350]);
    expect(importTransactionsCsv('Foo,Bar\n1,2').errors[0]).toMatch(/Date/);
  });
  it('export round-trips amounts through import', () => {
    const d = addTransaction(base(), { date: '2026-01-05', accountId: 'chk', payee: 'A, B', memo: '', splits: [sp('gro', -4250)] });
    const back = importTransactionsCsv(exportTransactionsCsv(d));
    expect(back.rows[0]).toMatchObject({ date: '2026-01-05', payee: 'A, B', amountMinor: -4250, category: 'Groceries' });
  });
  it('restore validation', () => {
    const d = addTransaction(base(), { date: '2026-01-05', accountId: 'chk', payee: '', memo: '', splits: [sp('gro', -1)] });
    expect(validateLedger(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const bad = JSON.parse(JSON.stringify(d)); bad.transactions[0].splits[0].amountMinor = 1.5;
    expect(() => validateLedger(bad)).toThrow(/whole/);
    const bad2 = JSON.parse(JSON.stringify(d)); bad2.transactions[0].accountId = 'x';
    expect(() => validateLedger(bad2)).toThrow(/missing account/);
  });
});
