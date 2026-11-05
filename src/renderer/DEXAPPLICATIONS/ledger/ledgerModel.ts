// =============================================================================
// DEX Ledger — domain model (pure; money in integer minor units)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// Rules this module enforces:
// - Amounts are integers of minor units (cents). Parsing never goes through a
//   float, so "0.1 + 0.2" style drift cannot happen.
// - A transfer is two linked transactions (one per account) with no category.
//   Transfers move money between accounts and never count as income/expense.
// - A transaction's amount is the sum of its splits; each split may carry its
//   own category.
// - Budgets are per month and category; "available" carries over month to month.
// =============================================================================

export type AccountType = 'checking' | 'savings' | 'cash' | 'credit' | 'investment' | 'loan';
export const ACCOUNT_TYPES: { id: AccountType; label: string; group: 'Cash' | 'Credit' | 'Tracking' }[] = [
  { id: 'checking', label: 'Checking', group: 'Cash' },
  { id: 'savings', label: 'Savings', group: 'Cash' },
  { id: 'cash', label: 'Cash', group: 'Cash' },
  { id: 'credit', label: 'Credit card', group: 'Credit' },
  { id: 'investment', label: 'Investment', group: 'Tracking' },
  { id: 'loan', label: 'Loan', group: 'Tracking' },
];

export interface Account { id: string; name: string; type: AccountType; openingMinor: number; openingDate: string; closed: boolean }
export interface Category { id: string; name: string; group: string; kind: 'income' | 'expense'; archived: boolean }
export interface Split { categoryId: string | null; amountMinor: number; memo: string }
/** 0 = uncleared, 1 = cleared, 2 = reconciled (locked). */
export type TxnStatus = 0 | 1 | 2;
export interface Transaction {
  id: string; date: string; accountId: string; payee: string; memo: string;
  transferId: string | null; transferAccountId: string | null;
  status: TxnStatus; createdAt: number; splits: Split[];
}
export interface Budget { month: string; categoryId: string; amountMinor: number }
export interface LedgerDoc {
  version: 1; currency: string;
  accounts: Account[]; categories: Category[]; transactions: Transaction[]; budgets: Budget[];
}

let seq = 0;
export function newId(p: string): string {
  seq = (seq + 1) % 1e6;
  return `${p}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyLedger(currency = 'USD'): LedgerDoc {
  return { version: 1, currency, accounts: [], categories: [], transactions: [], budgets: [] };
}

/** A small starter category set the user can rename or archive. */
export function starterCategories(): Category[] {
  const mk = (name: string, group: string, kind: Category['kind'] = 'expense'): Category => ({ id: newId('c'), name, group, kind, archived: false });
  return [
    mk('Salary', 'Income', 'income'), mk('Other income', 'Income', 'income'),
    mk('Rent / mortgage', 'Bills'), mk('Utilities', 'Bills'), mk('Phone & internet', 'Bills'),
    mk('Groceries', 'Everyday'), mk('Dining out', 'Everyday'), mk('Transport', 'Everyday'),
    mk('Health', 'Everyday'), mk('Entertainment', 'Wants'), mk('Shopping', 'Wants'),
    mk('Emergency fund', 'Savings goals'),
  ];
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Parse a user-typed amount into minor units without floats. Accepts
 * "1,234.56", "-12", "(45.10)" (accounting negative), "$9.99", "12.5".
 * Returns null for anything else (including more than 2 decimals).
 */
export function parseAmount(input: string): number | null {
  let t = input.trim().replace(/[\s$€£¥,]/g, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(t);
  if (!m || (!m[1] && !m[2])) return null;
  const whole = m[1] ? Number(m[1]) : 0;
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  if (!Number.isSafeInteger(whole * 100 + frac)) return null;
  const v = whole * 100 + frac;
  return neg ? -v : v;
}

export function formatMinor(minor: number, currency = 'USD', opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(minor);
  const s = `${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
  const sym = ({ USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$', NGN: '₦' } as Record<string, string>)[currency] ?? `${currency} `;
  const sign = minor < 0 ? '−' : opts.sign && minor > 0 ? '+' : '';
  return `${sign}${sym}${s}`;
}

export const txnAmount = (t: Transaction): number => t.splits.reduce((a, s) => a + s.amountMinor, 0);
export const isTransfer = (t: Transaction): boolean => !!t.transferId;
export const monthOf = (date: string): string => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = y * 12 + (m - 1) + n;
  return `${Math.floor(d / 12)}-${String((d % 12) + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Mutations (pure: return a new doc)
// ---------------------------------------------------------------------------

export function addTransaction(doc: LedgerDoc, t: Omit<Transaction, 'id' | 'createdAt' | 'transferId' | 'transferAccountId' | 'status'> & { status?: TxnStatus }): LedgerDoc {
  if (!t.splits.length) throw new Error('A transaction needs an amount.');
  if (t.splits.some((s) => !Number.isSafeInteger(s.amountMinor))) throw new Error('Amounts must be whole minor units.');
  const txn: Transaction = { ...t, id: newId('t'), createdAt: Date.now(), transferId: null, transferAccountId: null, status: t.status ?? 0 };
  return { ...doc, transactions: [...doc.transactions, txn] };
}

/** Move `amountMinor` (> 0) from one account to another: two linked legs. */
export function addTransfer(doc: LedgerDoc, fromId: string, toId: string, amountMinor: number, date: string, memo = ''): LedgerDoc {
  if (fromId === toId) throw new Error('Choose two different accounts.');
  if (!(amountMinor > 0) || !Number.isSafeInteger(amountMinor)) throw new Error('Transfer amount must be greater than zero.');
  const tid = newId('x');
  const now = Date.now();
  const from = doc.accounts.find((a) => a.id === fromId)?.name ?? 'account';
  const to = doc.accounts.find((a) => a.id === toId)?.name ?? 'account';
  const leg = (accountId: string, other: string, amt: number, payee: string): Transaction => ({
    id: newId('t'), date, accountId, payee, memo, transferId: tid, transferAccountId: other, status: 0, createdAt: now,
    splits: [{ categoryId: null, amountMinor: amt, memo: '' }],
  });
  return { ...doc, transactions: [...doc.transactions, leg(fromId, toId, -amountMinor, `Transfer to ${to}`), leg(toId, fromId, amountMinor, `Transfer from ${from}`)] };
}

/** Update a transaction; for a transfer, the linked leg mirrors date/amount/memo. */
export function updateTransaction(doc: LedgerDoc, id: string, patch: Partial<Pick<Transaction, 'date' | 'payee' | 'memo' | 'splits' | 'status'>>): LedgerDoc {
  const t = doc.transactions.find((x) => x.id === id);
  if (!t) return doc;
  if (t.status === 2 && (patch.splits || patch.date)) throw new Error('This transaction is reconciled. Mark it uncleared before changing its amount or date.');
  if (t.transferId && patch.splits && patch.splits.some((s) => s.categoryId)) throw new Error('A transfer cannot have a category.');
  return {
    ...doc,
    transactions: doc.transactions.map((x) => {
      if (x.id === id) return { ...x, ...patch };
      if (t.transferId && x.transferId === t.transferId) {
        const mirror: Partial<Transaction> = {};
        if (patch.date) mirror.date = patch.date;
        if (patch.memo !== undefined) mirror.memo = patch.memo;
        if (patch.splits) mirror.splits = [{ categoryId: null, amountMinor: -patch.splits.reduce((a, s) => a + s.amountMinor, 0), memo: '' }];
        return { ...x, ...mirror };
      }
      return x;
    }),
  };
}

/** Delete a transaction (and its transfer leg). */
export function deleteTransaction(doc: LedgerDoc, id: string): LedgerDoc {
  const t = doc.transactions.find((x) => x.id === id);
  if (!t) return doc;
  return { ...doc, transactions: doc.transactions.filter((x) => x.id !== id && !(t.transferId && x.transferId === t.transferId)) };
}

export function setBudget(doc: LedgerDoc, month: string, categoryId: string, amountMinor: number): LedgerDoc {
  const rest = doc.budgets.filter((b) => !(b.month === month && b.categoryId === categoryId));
  return { ...doc, budgets: amountMinor === 0 ? rest : [...rest, { month, categoryId, amountMinor }] };
}

/** Deleting a category that is in use is refused; archive it instead. */
export function deleteCategory(doc: LedgerDoc, id: string): LedgerDoc {
  if (doc.transactions.some((t) => t.splits.some((s) => s.categoryId === id))) throw new Error('This category is used by transactions. Archive it instead.');
  return { ...doc, categories: doc.categories.filter((c) => c.id !== id), budgets: doc.budgets.filter((b) => b.categoryId !== id) };
}

/** Deleting an account that has transactions is refused; close it instead. */
export function deleteAccount(doc: LedgerDoc, id: string): LedgerDoc {
  if (doc.transactions.some((t) => t.accountId === id || t.transferAccountId === id)) throw new Error('This account has transactions. Close it instead to keep its history.');
  return { ...doc, accounts: doc.accounts.filter((a) => a.id !== id) };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function accountBalance(doc: LedgerDoc, accountId: string, opts: { clearedOnly?: boolean; upTo?: string } = {}): number {
  const a = doc.accounts.find((x) => x.id === accountId);
  if (!a) return 0;
  let bal = a.openingMinor;
  for (const t of doc.transactions) {
    if (t.accountId !== accountId) continue;
    if (opts.clearedOnly && t.status === 0) continue;
    if (opts.upTo && t.date > opts.upTo) continue;
    bal += txnAmount(t);
  }
  return bal;
}

/** Net worth = sum of open and closed account balances (credit/loan are negative). */
export function netWorth(doc: LedgerDoc): number {
  return doc.accounts.reduce((sum, a) => sum + accountBalance(doc, a.id), 0);
}

export interface MonthSummary { month: string; incomeMinor: number; expenseMinor: number; netMinor: number; byCategory: Map<string, number>; uncategorizedMinor: number }

/** Income and spending for a month. Transfers are excluded by construction. */
export function monthSummary(doc: LedgerDoc, month: string): MonthSummary {
  const kind = new Map(doc.categories.map((c) => [c.id, c.kind]));
  const byCategory = new Map<string, number>();
  let income = 0; let expense = 0; let uncategorized = 0;
  for (const t of doc.transactions) {
    if (isTransfer(t) || monthOf(t.date) !== month) continue;
    for (const s of t.splits) {
      if (!s.categoryId) { uncategorized += s.amountMinor; continue; }
      byCategory.set(s.categoryId, (byCategory.get(s.categoryId) ?? 0) + s.amountMinor);
      if (kind.get(s.categoryId) === 'income') income += s.amountMinor; else expense -= s.amountMinor;
    }
  }
  return { month, incomeMinor: income, expenseMinor: expense, netMinor: income - expense, byCategory, uncategorizedMinor: uncategorized };
}

export interface BudgetRow { categoryId: string; budgetedMinor: number; activityMinor: number; availableMinor: number }

/**
 * Budget view for a month (expense categories). Activity is this month's
 * category total (negative = spending). Available carries over: all budgeted
 * minus all spent up to and including this month.
 */
export function budgetMonth(doc: LedgerDoc, month: string): { rows: BudgetRow[]; budgetedMinor: number; activityMinor: number; incomeMinor: number } {
  const rows: BudgetRow[] = [];
  const activityUpTo = new Map<string, number>();
  const activityThis = new Map<string, number>();
  for (const t of doc.transactions) {
    if (isTransfer(t)) continue;
    const m = monthOf(t.date);
    if (m > month) continue;
    for (const s of t.splits) {
      if (!s.categoryId) continue;
      activityUpTo.set(s.categoryId, (activityUpTo.get(s.categoryId) ?? 0) + s.amountMinor);
      if (m === month) activityThis.set(s.categoryId, (activityThis.get(s.categoryId) ?? 0) + s.amountMinor);
    }
  }
  let budgeted = 0; let activity = 0;
  for (const c of doc.categories) {
    if (c.kind !== 'expense' || c.archived) continue;
    const b = doc.budgets.find((x) => x.month === month && x.categoryId === c.id)?.amountMinor ?? 0;
    const allB = doc.budgets.filter((x) => x.categoryId === c.id && x.month <= month).reduce((a, x) => a + x.amountMinor, 0);
    const act = activityThis.get(c.id) ?? 0;
    rows.push({ categoryId: c.id, budgetedMinor: b, activityMinor: act, availableMinor: allB + (activityUpTo.get(c.id) ?? 0) });
    budgeted += b; activity += act;
  }
  return { rows, budgetedMinor: budgeted, activityMinor: activity, incomeMinor: monthSummary(doc, month).incomeMinor };
}

export interface ReconcileState { clearedMinor: number; statementMinor: number; differenceMinor: number; pending: number }

export function reconcileState(doc: LedgerDoc, accountId: string, statementMinor: number): ReconcileState {
  const cleared = accountBalance(doc, accountId, { clearedOnly: true });
  const pending = doc.transactions.filter((t) => t.accountId === accountId && t.status === 1).length;
  return { clearedMinor: cleared, statementMinor, differenceMinor: statementMinor - cleared, pending };
}

/** Lock cleared transactions as reconciled. Refused unless the difference is zero. */
export function finishReconcile(doc: LedgerDoc, accountId: string, statementMinor: number): LedgerDoc {
  const st = reconcileState(doc, accountId, statementMinor);
  if (st.differenceMinor !== 0) throw new Error(`Cleared balance is off by ${formatMinor(st.differenceMinor, doc.currency)}.`);
  return { ...doc, transactions: doc.transactions.map((t) => (t.accountId === accountId && t.status === 1 ? { ...t, status: 2 as TxnStatus } : t)) };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function csvParse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const esc = (v: string | number) => { const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function exportTransactionsCsv(doc: LedgerDoc, accountId?: string): string {
  const acct = new Map(doc.accounts.map((a) => [a.id, a.name]));
  const cat = new Map(doc.categories.map((c) => [c.id, c.name]));
  const lines = [['date', 'account', 'payee', 'category', 'memo', 'amount', 'status', 'transfer_account'].join(',')];
  const list = doc.transactions.filter((t) => !accountId || t.accountId === accountId).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  for (const t of list) {
    for (const s of t.splits) {
      const amt = `${s.amountMinor < 0 ? '-' : ''}${Math.floor(Math.abs(s.amountMinor) / 100)}.${String(Math.abs(s.amountMinor) % 100).padStart(2, '0')}`;
      lines.push([t.date, acct.get(t.accountId) ?? '', t.payee, s.categoryId ? cat.get(s.categoryId) ?? '' : '', s.memo || t.memo, amt,
        ['uncleared', 'cleared', 'reconciled'][t.status], t.transferAccountId ? acct.get(t.transferAccountId) ?? '' : ''].map(esc).join(','));
    }
  }
  return lines.join('\r\n') + '\r\n';
}

/** Normalize common date spellings to YYYY-MM-DD. `dmy` picks the order for 01/02/2026. */
export function normalizeDate(s: string, order: 'mdy' | 'dmy' = 'mdy'): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let y: number; let mo: number; let d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(t))) {
    y = +m[3];
    [mo, d] = order === 'mdy' ? [+m[1], +m[2]] : [+m[2], +m[1]];
  } else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface CsvImportResult {
  rows: { date: string; payee: string; memo: string; amountMinor: number; category: string }[];
  errors: string[];
}

/**
 * Read a bank CSV. Needs a header row with a date column and either an
 * amount column or debit/credit columns. Payee/description, memo and
 * category columns are optional. Every rejected line is reported.
 */
export function importTransactionsCsv(text: string, dateOrder: 'mdy' | 'dmy' = 'mdy'): CsvImportResult {
  const rows = csvParse(text.replace(/^﻿/, ''));
  const errors: string[] = [];
  if (rows.length < 2) return { rows: [], errors: ['The file has no data rows.'] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iDate = find('date', 'transaction date', 'posted date', 'posting date');
  const iAmt = find('amount', 'value');
  const iDebit = find('debit', 'withdrawal', 'withdrawals', 'out');
  const iCredit = find('credit', 'deposit', 'deposits', 'in');
  const iPayee = find('payee', 'description', 'name', 'merchant');
  const iMemo = find('memo', 'notes', 'reference');
  const iCat = find('category');
  if (iDate < 0) return { rows: [], errors: ['No "Date" column found in the header.'] };
  if (iAmt < 0 && iDebit < 0 && iCredit < 0) return { rows: [], errors: ['No "Amount" (or "Debit"/"Credit") column found in the header.'] };
  const out: CsvImportResult['rows'] = [];
  rows.slice(1).forEach((r, n) => {
    const line = n + 2;
    const date = normalizeDate(r[iDate] ?? '', dateOrder);
    if (!date) { errors.push(`Line ${line}: unreadable date "${r[iDate] ?? ''}".`); return; }
    let amt: number | null;
    if (iAmt >= 0) amt = parseAmount(r[iAmt] ?? '');
    else {
      const db = (r[iDebit] ?? '').trim() ? parseAmount(r[iDebit]) : 0;
      const cr = (r[iCredit] ?? '').trim() ? parseAmount(r[iCredit]) : 0;
      amt = db === null || cr === null ? null : cr - Math.abs(db);
    }
    if (amt === null) { errors.push(`Line ${line}: unreadable amount.`); return; }
    out.push({ date, amountMinor: amt, payee: (r[iPayee] ?? '').trim(), memo: iMemo >= 0 ? (r[iMemo] ?? '').trim() : '', category: iCat >= 0 ? (r[iCat] ?? '').trim() : '' });
  });
  return { rows: out, errors };
}

// ---------------------------------------------------------------------------
// Backup / restore validation (mirrors the native checks)
// ---------------------------------------------------------------------------

export function validateLedger(input: unknown): LedgerDoc {
  if (!input || typeof input !== 'object') throw new Error('Not a DEX Ledger backup.');
  const o = input as Partial<LedgerDoc>;
  if (o.version !== 1) throw new Error('Unsupported backup version.');
  for (const k of ['accounts', 'categories', 'transactions', 'budgets'] as const) if (!Array.isArray(o[k])) throw new Error(`Backup is missing ${k}.`);
  const acc = new Set(o.accounts!.map((a) => a.id));
  const cat = new Set(o.categories!.map((c) => c.id));
  for (const t of o.transactions!) {
    if (!acc.has(t.accountId)) throw new Error(`Transaction on ${t.date} refers to a missing account.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) throw new Error('A transaction has an invalid date.');
    if (!Array.isArray(t.splits) || !t.splits.length) throw new Error('A transaction has no amount.');
    for (const s of t.splits) {
      if (!Number.isSafeInteger(s.amountMinor)) throw new Error('Amounts must be whole minor units.');
      if (s.categoryId && !cat.has(s.categoryId)) throw new Error('A transaction refers to a missing category.');
    }
  }
  return {
    version: 1, currency: typeof o.currency === 'string' && /^[A-Z]{3}$/.test(o.currency) ? o.currency : 'USD',
    accounts: o.accounts!, categories: o.categories!, transactions: o.transactions!, budgets: o.budgets!,
  };
}
