// =============================================================================
// DEX Platform — DEX Ledger change-history wording
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Turns the engine's audit rows (action + entity + JSON detail, written by
// core/dex-ledger) into a plain sentence and a short detail line. Nothing is
// invented: a field the row doesn't carry is left out, and an unknown
// action/entity pair falls back to its raw words rather than a guess.

import type { AuditEntry } from './ledgerApi';

export interface AuditNames {
  /** Formats integer minor units as money. */
  fmt: (minor: number, opts?: { sign?: boolean }) => string;
  account: (id: number) => string | undefined;
  category: (id: number) => string | undefined;
}

export interface AuditText { title: string; detail: string }

type D = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const FIELD_LABEL: Record<string, string> = {
  name: 'name', kind: 'type', notes: 'notes', openingBalance: 'opening balance', openingDate: 'opening date',
  date: 'date', payee: 'description', memo: 'notes', amount: 'amount', categoryId: 'category', status: 'status',
  splits: 'split lines', accountId: 'account', archived: 'archived', groupId: 'group',
};

function changedFields(d: D): string {
  const keys = Object.keys(d).filter(k => k !== 'confirmReconciled');
  if (!keys.length) return '';
  return `Changed ${keys.map(k => FIELD_LABEL[k] || k).join(', ')}`;
}

function idList(d: D): number {
  return Array.isArray(d.ids) ? d.ids.length : 0;
}

/** Human wording for one audit row. */
export function describeAudit(e: AuditEntry, n: AuditNames): AuditText {
  const d: D = e.detail && typeof e.detail === 'object' && !Array.isArray(e.detail) ? (e.detail as D) : {};
  const money = (v: unknown, sign = false) => { const m = num(v); return m === null ? null : n.fmt(m, { sign }); };
  const acct = (v: unknown) => { const id = num(v); return id === null ? null : n.account(id) ?? null; };
  const cat = (v: unknown) => { const id = num(v); return id === null ? null : n.category(id) ?? null; };
  const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');
  const self = e.entityId !== null ? e.entityId : null;
  const key = `${e.action} ${e.entity}`;

  switch (key) {
    case 'setup settings': return { title: 'Ledger created', detail: join(str(d.currency) && `Currency ${d.currency}`, d.seedCategories === true && 'Starter categories') };
    case 'update settings': {
      const c = d.currency as D | undefined;
      return { title: 'Currency changed', detail: c ? join(str(c.from), str(c.to)).replace(' · ', ' → ') : '' };
    }
    case 'import-legacy ledger': return { title: 'Imported the earlier ledger', detail: '' };
    case 'restore ledger': return { title: 'Backup restored', detail: join(str(d.from) && `From ${d.from}`) };

    case 'create account': return { title: `Account added: ${str(d.name) ?? 'unnamed'}`, detail: join(money(d.openingBalance) && `Opening balance ${money(d.openingBalance)}`, str(d.openingDate)) };
    case 'update account': return { title: `Account edited${self !== null && n.account(self) ? `: ${n.account(self)}` : ''}`, detail: changedFields(d) };
    case 'archive account': return { title: `Account archived${self !== null && n.account(self) ? `: ${n.account(self)}` : ''}`, detail: '' };
    case 'unarchive account': return { title: `Account restored${self !== null && n.account(self) ? `: ${n.account(self)}` : ''}`, detail: '' };
    case 'delete account': return { title: `Account deleted: ${str(d.name) ?? 'unnamed'}`, detail: '' };
    case 'import account': return {
      title: `CSV imported${self !== null && n.account(self) ? ` into ${n.account(self)}` : ''}`,
      detail: join(num(d.imported) !== null && `${plural(num(d.imported)!, 'transaction')} added`, num(d.skipped) ? `${num(d.skipped)} skipped` : null),
    };
    case 'reconcile account': return {
      title: `Reconciled${self !== null && n.account(self) ? ` ${n.account(self)}` : ''}`,
      detail: join(str(d.statementDate) && `Statement ${d.statementDate}`, money(d.statementBalance) && `Balance ${money(d.statementBalance)}`, num(d.transactions) !== null && plural(num(d.transactions)!, 'transaction')),
    };
    case 'unreconcile account': return { title: `Reconciliation undone${self !== null && n.account(self) ? ` for ${n.account(self)}` : ''}`, detail: num(d.transactions) !== null ? `${plural(num(d.transactions)!, 'transaction')} reopened` : '' };

    case 'create group': return { title: `Group added: ${str(d.name) ?? 'unnamed'}`, detail: d.kind === 'income' ? 'Income group' : 'Expense group' };
    case 'rename group': return { title: `Group renamed to ${str(d.name) ?? 'unnamed'}`, detail: '' };
    case 'delete group': return { title: 'Group deleted', detail: '' };
    case 'create category': return { title: `Category added: ${str(d.name) ?? 'unnamed'}`, detail: '' };
    case 'update category': return { title: `Category edited${self !== null && n.category(self) ? `: ${n.category(self)}` : ''}`, detail: changedFields(d) };
    case 'delete category': return { title: 'Category deleted', detail: '' };

    case 'assign category': return {
      title: `Budget set${self !== null && n.category(self) ? ` for ${n.category(self)}` : ''}`,
      detail: join(str(d.month), money(d.from) !== null && money(d.to) !== null ? `${money(d.from)} → ${money(d.to)}` : null),
    };
    case 'move budget': return {
      title: `Moved ${money(d.amount) ?? 'money'}`,
      detail: join(str(d.month), `${cat(d.from) ?? 'To assign'} → ${cat(d.to) ?? 'To assign'}`),
    };
    case 'copy budget': return { title: 'Copied last month\'s budget', detail: join(str(d.month), num(d.categories) !== null && plural(num(d.categories)!, 'category', 'categories')) };

    case 'create transaction': return {
      title: `Transaction added: ${str(d.payee) ?? 'no description'}`,
      detail: join(money(d.amount, true), str(d.date), acct(d.accountId), num(d.splitLines) ? `${num(d.splitLines)} split lines` : cat(d.categoryId)),
    };
    case 'create transfer': return {
      title: `Transfer of ${money(d.amount) ?? 'money'}`,
      detail: join(`${acct(d.from) ?? 'an account'} → ${acct(d.to) ?? 'an account'}`, str(d.date)),
    };
    case 'update transaction': return { title: 'Transaction edited', detail: changedFields(d) };
    case 'delete transaction':
    case 'delete transfer': return {
      title: `${e.entity === 'transfer' ? 'Transfer' : 'Transaction'} deleted${str(d.payee) ? `: ${d.payee}` : ''}`,
      detail: join(money(d.amount, true), str(d.date), str(d.accountName)),
    };
    case 'status transaction': {
      const c = idList(d);
      const via = d.via === 'statement match' ? ' (statement match)' : '';
      return { title: `Marked ${plural(c, 'transaction')} ${str(d.status) ?? ''}`.trim() + via, detail: '' };
    }
    case 'categorize transaction': return { title: `Categorised ${plural(idList(d), 'transaction')}`, detail: cat(d.categoryId) ?? (d.categoryId === null ? 'Uncategorised' : '') };
    case 'attach transaction': return { title: `Receipt attached${str(d.fileName) ? `: ${d.fileName}` : ''}`, detail: '' };
    case 'detach transaction': return { title: `Receipt removed${str(d.fileName) ? `: ${d.fileName}` : ''}`, detail: '' };

    case 'create recurring': return { title: 'Schedule added', detail: join(money(d.amount, true), str(d.frequency), str(d.nextDate) && `Next ${d.nextDate}`, acct(d.accountId)) };
    case 'update recurring': return { title: 'Schedule edited', detail: join(money(d.amount, true), str(d.frequency), str(d.nextDate) && `Next ${d.nextDate}`) };
    case 'delete recurring': return { title: 'Schedule deleted', detail: '' };
    case 'post recurring': return { title: 'Scheduled transaction entered', detail: join(str(d.date), str(d.nextDate) && `Next ${d.nextDate}`) };
    case 'skip recurring': return { title: 'Scheduled transaction skipped', detail: join(str(d.skipped) && `Skipped ${d.skipped}`, str(d.nextDate) && `Next ${d.nextDate}`) };
    default: {
      const words = `${e.action} ${e.entity}`.replace(/[-_]/g, ' ');
      return { title: words.charAt(0).toUpperCase() + words.slice(1), detail: '' };
    }
  }
}
