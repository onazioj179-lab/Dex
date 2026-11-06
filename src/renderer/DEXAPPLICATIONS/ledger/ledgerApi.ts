// =============================================================================
// DEX Platform — DEX Ledger client
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Thin typed wrapper over the native `ledger:*` channels (core/dex-ledger via
// src-tauri/src/ledger_ctl.rs). The renderer holds no financial state of its
// own: every figure on screen comes from the engine. Without the DEX desktop
// runtime there is no ledger — calls fail with `LedgerUnavailableError`, and
// the UI says so instead of inventing data.

export type AccountKind = 'cash' | 'checking' | 'savings' | 'credit' | 'other';
export type TxnStatus = 'uncleared' | 'cleared' | 'reconciled';

export interface LedgerStatus { ready: boolean; currency: string | null; digits: number; schemaVersion: number; accountCount: number; transactionCount: number }
export interface Account {
  id: number; name: string; kind: AccountKind; openingBalance: number; openingDate: string; archived: boolean; notes: string; sort: number;
  balance: number; clearedBalance: number; transactionCount: number; unclearedCount: number; lastReconciled: string | null;
}
export interface Category { id: number; name: string; archived: boolean; sort: number; useCount: number; groupId: number; kind: 'expense' | 'income' }
export interface CategoryGroup { id: number; name: string; kind: 'expense' | 'income'; sort: number; collapsed: boolean; categories: Category[] }
export interface Txn {
  id: number; accountId: number; accountName: string; date: string; payee: string; memo: string; amount: number;
  categoryId: number | null; categoryName: string | null; groupName: string | null; categoryKind: string | null; status: TxnStatus;
  isTransfer: boolean; transferAccountId: number | null; transferAccountName: string | null; transferPeerId: number | null;
  isSplit: boolean; splitCount: number; attachmentCount: number; reconciliationId: number | null;
}
export interface SplitLine { id?: number; categoryId: number | null; categoryName?: string | null; amount: number; memo: string }
export interface Attachment { id: number; fileName: string; mime: string; size: number; createdAt: number }
export interface TxnDetail extends Txn { splits: SplitLine[]; attachments: Attachment[] }
export interface TxnList { rows: Txn[]; total: number; sum: number }
export interface BudgetCategoryRow { id: number; name: string; archived: boolean; assigned: number; activity: number; available: number; prevAssigned: number; prevActivity: number }
export interface BudgetGroupRow { id: number; name: string; collapsed: boolean; assigned: number; activity: number; available: number; categories: BudgetCategoryRow[] }
export interface BudgetMonth {
  month: string; previousMonth: string; toAssign: number; income: number; assigned: number; activity: number; available: number;
  overspentCount: number; uncategorizedCount: number; uncategorizedAmount: number; groups: BudgetGroupRow[];
}
export interface Recurring {
  id: number; accountId: number; accountName: string; transferAccountId: number | null; transferAccountName: string | null;
  payee: string; memo: string; amount: number; categoryId: number | null; categoryName: string | null;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'; nextDate: string;
}
export interface Overview {
  from: string; to: string; totalBalance: number; balanceByKind: Partial<Record<AccountKind, number>>;
  income: number; expenses: number; uncategorized: number; net: number; recent: Txn[]; upcoming: Recurring[];
  uncategorizedCount: number; unclearedCount: number;
}
export interface CsvPreviewRow { line: number; date: string | null; payee: string; memo: string; amount: number | null; categoryName: string; categoryId: number | null; duplicate: boolean; error: string | null }
export interface CsvMapping { date: number | null; payee: number | null; amount: number | null; debit: number | null; credit: number | null; memo: number | null; category: number | null }
export interface CsvPreview { headers: string[]; mapping: CsvMapping; dateFormat: 'dmy' | 'mdy'; dateAmbiguous: boolean; rows: CsvPreviewRow[]; duplicateCount: number; errorCount: number }
export interface MatchLine { line: number; date: string | null; payee: string; memo: string; amount: number | null; error: string | null; matchId: number | null; matchStatus: TxnStatus | null; matchPayee: string | null }
export interface MatchResult { lines: MatchLine[]; unmatchedTransactions: Txn[]; statementTotal: number; dateFormat: 'dmy' | 'mdy'; dateAmbiguous: boolean; mapping: CsvMapping; headers: string[] }
export interface Reconciliation { id: number; accountId: number; accountName: string; statementDate: string; statementBalance: number; clearedBalance: number; transactions: number; adjustmentId: number | null; undone: boolean; createdAt: number }
export interface ReconcileSummary { accountId: number; clearedBalance: number; balance: number; open: Txn[]; last: Reconciliation | null }
export interface Backup { file: string; size: number; createdAt: number; label: string }
export interface AuditEntry { id: number; ts: number; action: string; entity: string; entityId: number | null; detail: unknown }

export class LedgerError extends Error {
  constructor(message: string, readonly channel: string, readonly recoverable = false) { super(message); }
}
export class LedgerUnavailableError extends LedgerError {}

interface Bridge { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }

function bridge(): Bridge | null {
  // Resolved at call time, never at module scope (window.dex is injected late in the packaged app).
  const dex = (window as unknown as { dex?: Bridge }).dex;
  return dex && typeof dex.invoke === 'function' ? dex : null;
}

export function ledgerAvailable(): boolean {
  return bridge() !== null;
}

/** Notifies every open Ledger view that stored data changed. */
export const LEDGER_CHANGED = 'dex-ledger-changed';

export async function call<T>(channel: string, payload: Record<string, unknown> = {}, opts: { mutates?: boolean } = {}): Promise<T> {
  const b = bridge();
  if (!b) throw new LedgerUnavailableError('DEX Ledger needs the DEX desktop app; its data lives in a local database the browser preview cannot open.', channel);
  const res = (await b.invoke(channel, payload)) as { ok?: boolean; data?: T; error?: string; recoverable?: boolean } | null;
  if (!res || typeof res !== 'object' || !('ok' in res)) {
    throw new LedgerUnavailableError('This DEX build has no ledger engine. Update DEX to use Ledger.', channel);
  }
  if (!res.ok) throw new LedgerError(res.error || 'The ledger refused that change', channel, !!res.recoverable);
  if (opts.mutates) {
    try { window.dispatchEvent(new CustomEvent(LEDGER_CHANGED, { detail: { channel } })); } catch { /* non-DOM */ }
  }
  return res.data as T;
}

/** Mutating call: fires LEDGER_CHANGED on success so views refresh. */
export function mutate<T>(channel: string, payload: Record<string, unknown> = {}): Promise<T> {
  return call<T>(channel, payload, { mutates: true });
}

export const ledger = {
  status: () => call<LedgerStatus>('ledger:status'),
  setup: (currency: string, seedCategories: boolean) => mutate<LedgerStatus>('ledger:setup', { currency, seedCategories }),
  setCurrency: (currency: string) => mutate<LedgerStatus>('ledger:settings:currency', { currency }),

  accounts: () => call<Account[]>('ledger:accounts:list'),
  createAccount: (a: { name: string; kind: AccountKind; openingBalance: number; openingDate: string; notes?: string }) => mutate<{ id: number }>('ledger:accounts:create', a),
  updateAccount: (a: { id: number; name?: string; kind?: AccountKind; notes?: string; openingBalance?: number; openingDate?: string; confirmReconciled?: boolean }) => mutate<{ id: number }>('ledger:accounts:update', a),
  archiveAccount: (id: number, archived: boolean) => mutate('ledger:accounts:archive', { id, archived }),
  deleteAccount: (id: number) => mutate('ledger:accounts:delete', { id }),
  reorderAccounts: (ids: number[]) => mutate('ledger:accounts:reorder', { ids }),

  categories: () => call<CategoryGroup[]>('ledger:categories:list'),
  createGroup: (name: string, kind: 'expense' | 'income' = 'expense') => mutate<{ id: number }>('ledger:groups:create', { name, kind }),
  updateGroup: (g: { id: number; name?: string; collapsed?: boolean }) => mutate('ledger:groups:update', g),
  deleteGroup: (id: number) => mutate('ledger:groups:delete', { id }),
  reorderGroups: (ids: number[]) => mutate('ledger:groups:reorder', { ids }),
  createCategory: (groupId: number, name: string) => mutate<{ id: number }>('ledger:categories:create', { groupId, name }),
  updateCategory: (c: { id: number; name?: string; groupId?: number; archived?: boolean }) => mutate('ledger:categories:update', c),
  deleteCategory: (id: number) => mutate('ledger:categories:delete', { id }),
  reorderCategories: (ids: number[]) => mutate('ledger:categories:reorder', { ids }),

  txns: (filter: Record<string, unknown>) => call<TxnList>('ledger:txns:list', filter),
  txn: (id: number) => call<TxnDetail>('ledger:txns:get', { id }),
  createTxn: (t: Record<string, unknown>) => mutate<{ id: number }>('ledger:txns:create', t),
  transfer: (t: { fromAccountId: number; toAccountId: number; date: string; amount: number; memo?: string; status?: TxnStatus }) => mutate<{ id: number; peerId: number }>('ledger:txns:transfer', t),
  updateTxn: (t: Record<string, unknown>) => mutate<{ id: number }>('ledger:txns:update', t),
  deleteTxns: (ids: number[], confirmReconciled = false) => mutate<{ deleted: number }>('ledger:txns:delete', { ids, confirmReconciled }),
  setStatus: (ids: number[], status: 'uncleared' | 'cleared', confirmReconciled = false) => mutate<{ updated: number }>('ledger:txns:setStatus', { ids, status, confirmReconciled }),
  categorize: (ids: number[], categoryId: number | null, confirmReconciled = false) => mutate<{ updated: number }>('ledger:txns:categorize', { ids, categoryId, confirmReconciled }),
  payees: () => call<{ payee: string; count: number; lastDate: string; lastCategoryId: number | null }[]>('ledger:payees'),

  attach: (txnId: number) => mutate<{ id?: number; canceled?: boolean }>('ledger:attachments:add', { txnId }),
  attachment: (id: number) => call<{ id: number; fileName: string; mime: string; base64: string }>('ledger:attachments:get', { id }),
  saveAttachment: (id: number) => call<{ canceled: boolean; path?: string }>('ledger:attachments:saveAs', { id }),
  deleteAttachment: (id: number) => mutate('ledger:attachments:delete', { id }),

  budget: (month: string) => call<BudgetMonth>('ledger:budget:month', { month }),
  assign: (categoryId: number, month: string, amount: number) => mutate('ledger:budget:set', { categoryId, month, amount }),
  move: (m: { month: string; fromCategoryId: number | null; toCategoryId: number | null; amount: number }) => mutate('ledger:budget:move', m),
  copyPrevious: (month: string) => mutate<{ copied: number }>('ledger:budget:copyPrevious', { month }),

  recurring: () => call<Recurring[]>('ledger:recurring:list'),
  createRecurring: (r: Record<string, unknown>) => mutate<{ id: number }>('ledger:recurring:create', r),
  updateRecurring: (r: Record<string, unknown>) => mutate<{ id: number }>('ledger:recurring:update', r),
  deleteRecurring: (id: number) => mutate('ledger:recurring:delete', { id }),
  postRecurring: (id: number, date?: string) => mutate<{ transactionId: number; nextDate: string }>('ledger:recurring:post', { id, date }),
  skipRecurring: (id: number) => mutate<{ nextDate: string }>('ledger:recurring:skip', { id }),

  overview: (from: string, to: string, today: string) => call<Overview>('ledger:overview', { from, to, today }),
  report: <T>(name: 'incomeExpense' | 'cashFlow' | 'spending' | 'balances' | 'budgetVsActual', p: Record<string, unknown>) => call<T>(`ledger:reports:${name}`, p),
  reportCsv: (report: string, p: Record<string, unknown>) => call<{ csv: string; count?: number }>('ledger:reports:csv', { report, ...p }),

  openCsv: () => call<{ canceled: boolean; name?: string; content?: string }>('ledger:file:openCsv'),
  saveText: (suggestedName: string, content: string) => call<{ canceled: boolean; path?: string }>('ledger:file:saveText', { suggestedName, content }),
  csvPreview: (p: Record<string, unknown>) => call<CsvPreview>('ledger:csv:preview', p),
  csvImport: (accountId: number, rows: { date: string; payee: string; memo: string; amount: number; categoryId: number | null }[], skipDuplicates = true) =>
    mutate<{ imported: number; skipped: number; backup: string }>('ledger:csv:import', { accountId, rows, skipDuplicates }),
  csvExport: (filter: Record<string, unknown>) => call<{ csv: string; count: number; currency: string }>('ledger:csv:export', filter),

  reconcileSummary: (accountId: number) => call<ReconcileSummary>('ledger:reconcile:summary', { accountId }),
  reconcileMatch: (p: Record<string, unknown>) => call<MatchResult>('ledger:reconcile:match', p),
  reconcileFinish: (p: { accountId: number; statementDate: string; statementBalance: number; createAdjustment?: boolean }) =>
    mutate<{ id: number; transactions: number; adjustmentId: number | null; difference: number }>('ledger:reconcile:finish', p),
  reconcileUndo: (id: number) => mutate<{ transactions: number }>('ledger:reconcile:undo', { id }),
  reconcileHistory: (accountId?: number) => call<Reconciliation[]>('ledger:reconcile:history', accountId ? { accountId } : {}),

  backup: () => call<Backup>('ledger:backup:create'),
  backups: () => call<Backup[]>('ledger:backup:list'),
  restore: (file: string) => mutate<{ restored: boolean; safetyBackup: string }>('ledger:backup:restore', { file }),
  exportBackup: () => call<{ canceled?: boolean; path?: string }>('ledger:backup:export'),
  importBackup: () => mutate<{ canceled?: boolean; restored?: boolean; safetyBackup?: string }>('ledger:backup:importFile'),
  openBackupFolder: () => call('ledger:backup:openFolder'),
  recover: (action: 'restoreLatest' | 'startFresh') => mutate<{ damagedFileKeptAs: string | null; restoredFrom: string | null }>('ledger:recover', { action }),
  /** An earlier DEX build's ledger (dex.db tables), if any. Read-only. */
  legacyProbe: () => call<{ accounts: number; transactions: number; currency: string } | null>('ledger:legacy:probe'),
  legacyImport: () => mutate<{ accounts: number; categories: number; transactions: number; budgets: number; skipped: number; skippedDetail: string[]; currency: string }>('ledger:legacy:import'),
  audit: (limit = 200) => call<AuditEntry[]>('ledger:audit:list', { limit }),
  integrity: () => call<{ sqlite: string; foreignKeyViolations: number; issues: unknown[]; ok: boolean }>('ledger:integrity'),
};

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: 'Cash', checking: 'Bank accounts', savings: 'Savings', credit: 'Credit', other: 'Other accounts',
};
export const ACCOUNT_KIND_SINGULAR: Record<AccountKind, string> = {
  cash: 'Cash', checking: 'Bank account', savings: 'Savings account', credit: 'Credit card', other: 'Other',
};
export const ACCOUNT_KINDS: AccountKind[] = ['cash', 'checking', 'savings', 'credit', 'other'];
