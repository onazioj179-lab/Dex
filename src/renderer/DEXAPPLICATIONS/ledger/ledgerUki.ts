// =============================================================================
// DEX Platform — DEX Ledger UKI actions
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// What UKI may do in Ledger, through the same native engine the UI uses:
//   ledger.summary         balances + this month's income/spending (sendsContent:
//                          financial figures go into the conversation, so the
//                          user is asked every time)
//   ledger.addTransaction  one expense or income line (mutates: asked first)
// Names are matched to real accounts/categories; anything ambiguous or unknown
// is refused with the choices listed, never guessed.

import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { ledger, newIdempotencyKey, type Account, type CategoryGroup } from './ledgerApi';
import { formatMoney, parseMoneyInput, todayLocal, monthOf, monthEnd } from './money';

export interface Named { id: number; name: string }

/** Exact (case-insensitive) match first, then a name contained in exactly one item. */
export function matchByName<T extends Named>(items: T[], query: string): { item: T } | { error: string } {
  const q = query.trim().toLowerCase();
  const list = items.map((i) => i.name).join(', ') || 'none';
  if (!q) return { error: `Name one of: ${list}.` };
  const exact = items.filter((i) => i.name.toLowerCase() === q);
  if (exact.length === 1) return { item: exact[0] };
  // Otherwise the name must appear in exactly one item (money: never pick between two).
  const has = items.filter((i) => i.name.toLowerCase().includes(q));
  if (has.length === 1) return { item: has[0] };
  if (has.length > 1) return { error: `"${query}" matches ${has.map((i) => i.name).join(', ')}. Say which one.` };
  return { error: `No "${query}". Choose one of: ${list}.` };
}

/** Amount for a new line: expenses are negative, income positive, from a plain number. */
export function signedAmount(text: string, kind: 'expense' | 'income', digits: number): { minor: number } | { error: string } {
  const p = parseMoneyInput(String(text).replace(/^[-−+]/, ''), digits, '.');
  if (!p.ok) return { error: p.error };
  if (p.minor === 0) return { error: 'The amount must be more than zero.' };
  return { minor: kind === 'expense' ? -Math.abs(p.minor) : Math.abs(p.minor) };
}

/** YYYY-MM-DD only, and a real calendar date. */
export function validDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day;
}

function categoriesOf(groups: CategoryGroup[], kind: 'expense' | 'income'): Named[] {
  return groups.filter((g) => g.kind === kind).flatMap((g) => g.categories.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name })));
}

export function registerLedgerUkiActions(currency: string, digits: number): () => void {
  const fmt = (m: number) => formatMoney(m, currency, digits);

  registerUkiAppAction('ledger', {
    id: 'ledger.summary',
    description: 'read account balances and this month\'s income and spending from Ledger. Asks the user first (financial data).',
    args: [],
    example: '{}',
    mutates: false,
    sendsContent: true,
  }, async () => {
    const today = todayLocal();
    const month = monthOf(today);
    const [accounts, ov] = await Promise.all([ledger.accounts(), ledger.overview(`${month}-01`, monthEnd(month), today)]);
    const open = accounts.filter((a: Account) => !a.archived);
    const lines = open.map((a) => `- ${a.name} (${a.kind}): ${fmt(a.balance)}`);
    return [
      `Ledger, ${month} (${currency}):`,
      ...(lines.length ? lines : ['- no accounts yet']),
      `Total balance ${fmt(ov.totalBalance)}. This month: income ${fmt(ov.income)}, spending ${fmt(Math.abs(ov.expenses))}, net ${fmt(ov.net)}.`,
      ov.uncategorizedCount ? `${ov.uncategorizedCount} transaction(s) have no category.` : '',
    ].filter(Boolean).join('\n');
  });

  registerUkiAppAction('ledger', {
    id: 'ledger.addTransaction',
    description: 'add one expense or income to a Ledger account. amount is a plain positive number in the ledger currency; kind is "expense" (default) or "income"; category and date (YYYY-MM-DD, default today) are optional.',
    args: [
      { name: 'account', type: 'string' },
      { name: 'payee', type: 'string' },
      { name: 'amount', type: 'string' },
      { name: 'kind', type: 'string', optional: true },
      { name: 'category', type: 'string', optional: true },
      { name: 'date', type: 'string', optional: true },
      { name: 'memo', type: 'string', optional: true },
    ],
    example: '{"account": "Checking", "payee": "Grocer", "amount": "42.50", "category": "Groceries"}',
    mutates: true,
  }, async (args) => {
    const kind = String(args.kind ?? 'expense').toLowerCase() === 'income' ? 'income' : 'expense';
    const accounts = (await ledger.accounts()).filter((a) => !a.archived);
    const acc = matchByName(accounts, String(args.account ?? ''));
    if ('error' in acc) return `Not added. Account: ${acc.error}`;
    const amt = signedAmount(String(args.amount ?? ''), kind, digits);
    if ('error' in amt) return `Not added. Amount: ${amt.error}`;
    const date = args.date ? String(args.date) : todayLocal();
    if (!validDate(date)) return 'Not added. Date must be YYYY-MM-DD.';
    let categoryId: number | null = null;
    let catName = 'no category';
    if (args.category && String(args.category).trim()) {
      const cat = matchByName(categoriesOf(await ledger.categories(), kind), String(args.category));
      if ('error' in cat) return `Not added. Category: ${cat.error}`;
      categoryId = cat.item.id; catName = cat.item.name;
    }
    const payee = String(args.payee ?? '').trim().slice(0, 200);
    if (!payee) return 'Not added. Say who the payee is.';
    await ledger.createTxn({
      accountId: acc.item.id, date, payee, memo: String(args.memo ?? '').slice(0, 500),
      amount: amt.minor, categoryId, status: 'uncleared', idempotencyKey: newIdempotencyKey(),
    });
    return `Added ${kind} ${fmt(Math.abs(amt.minor))} to ${acc.item.name} on ${date}: ${payee} (${catName}).`;
  });

  return () => { unregisterUkiAppAction('ledger.summary'); unregisterUkiAppAction('ledger.addTransaction'); };
}
