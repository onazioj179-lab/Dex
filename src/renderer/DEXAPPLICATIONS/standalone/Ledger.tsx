// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import DexIcon from '../../components/DexIcon';
import { useConfirm } from '../../components/ConfirmDialog';
import { invokePlatformIpc } from '../../services/platform/ipc';
import { useAsyncResource } from '../../utils/useAsyncResource';
import {
  LEDGER_CURRENCIES, decimalLedgerAmount, formatLedgerAmount, ledgerCsv, localLedgerDate,
  parseLedgerAmount, readLedgerCsv, type LedgerCurrency, type LedgerEntry, type LedgerPage,
  type LedgerQuery, type LedgerRow,
} from './ledgerModel';
import './ledger.css';

interface Draft extends Omit<LedgerEntry, 'amountMinor'> {
  amount: string;
  id?: number;
  revision?: number;
}

type Reply<T> = { success: true } & T;
async function ledgerRequest<T = Record<string, never>>(action: string, ...args: unknown[]): Promise<Reply<T>> {
  const result = await invokePlatformIpc<Reply<T> | { success: false; error?: string }>('ledger:' + action, ...args);
  if (!result?.success) throw new Error(result?.error || 'Ledger storage is unavailable.');
  return result;
}

function CurrencyOptions() {
  return <>{LEDGER_CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</>;
}

const pill = { borderRadius: 999 };

export default function Ledger() {
  const [currency, setCurrency] = useState<LedgerCurrency>('USD');
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [operation, setOperation] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmHost } = useConfirm();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOffset(0);
      setAppliedSearch(search.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query: LedgerQuery = { currency, month, search: appliedSearch, offset };
  const key = JSON.stringify(query);
  const { data, loading, error, reload } = useAsyncResource(async () => ({
    key,
    page: await ledgerRequest<LedgerPage>('list', query),
  }), { deps: [key], timeoutMs: 10000 });
  const page = data?.key === key ? data.page : null;
  const format = (value: string | number | bigint) => formatLedgerAmount(value, currency);

  const run = async (name: string, action: () => Promise<void>, fail = (text: string) => setNotice({ text, error: true })) => {
    if (busy.current) return;
    busy.current = true;
    setOperation(name);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      fail(reason instanceof Error ? reason.message : 'Ledger could not complete the operation.');
    } finally {
      busy.current = false;
      setOperation('');
    }
  };

  const openDraft = (entry?: LedgerRow) => {
    setFormError('');
    setDraft(entry ? { ...entry, amount: decimalLedgerAmount(BigInt(entry.amountMinor), entry.currency) }
      : { date: localLedgerDate(), kind: 'expense', currency, category: '', description: '', amount: '' });
  };

  const save = () => {
    if (!draft) return;
    setFormError('');
    void run('save', async () => {
      const entry: LedgerEntry = {
        date: draft.date, kind: draft.kind, currency: draft.currency,
        amountMinor: parseLedgerAmount(draft.amount, draft.currency),
        category: draft.category, description: draft.description,
      };
      await ledgerRequest('save', entry, draft.id ?? null, draft.revision ?? null);
      setDraft(null);
      setNotice({ text: draft.id ? 'Transaction updated.' : 'Transaction added.' });
      if (draft.currency !== currency) {
        setCurrency(draft.currency);
        setOffset(0);
      }
      reload();
    }, setFormError);
  };

  const remove = async (entry: LedgerRow) => {
    if (busy.current || !await confirm({
      title: 'Delete transaction?',
      message: entry.description || entry.category,
      confirmLabel: 'Delete',
      tone: 'destructive',
    })) return;
    await run('delete', async () => {
      await ledgerRequest('delete', entry.id, entry.revision);
      setNotice({ text: 'Transaction deleted.' });
      reload();
    });
  };

  const importFile = (file: File) => void run('import', async () => {
    if (file.size > 8 * 1024 * 1024) throw new Error('Choose a CSV file up to 8 MiB.');
    const entries = readLedgerCsv(await file.text());
    const result = await ledgerRequest<{ inserted: number; duplicates: number }>('import', entries);
    setNotice({ text: 'Imported ' + result.inserted + ' · Skipped ' + result.duplicates + ' duplicate' + (result.duplicates === 1 ? '' : 's') });
    reload();
  });

  const exportView = () => void run('export', async () => {
    const result = await ledgerRequest<LedgerPage>('export', query);
    if (!result.entries.length) return;
    const saved = await ledgerRequest<{ canceled?: boolean }>('saveCsv', ledgerCsv(result.entries));
    if (!saved.canceled) setNotice({ text: 'CSV exported.' });
  });

  return (
    <div className="dex-ledger">
      <header className="dex-ledger__header">
        <h1><DexIcon name="book-open" size={22} /> Ledger</h1>
        <div className="dex-ledger__actions">
          <Button size="sm" style={pill} onClick={() => input.current?.click()} loading={operation === 'import'} disabled={!!operation}>Import CSV</Button>
          <input type="file" accept=".csv,text/csv" hidden ref={input} onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) importFile(file);
          }} />
          <Button size="sm" style={pill} onClick={exportView} loading={operation === 'export'} disabled={!!operation || !page?.count || loading || search.trim() !== appliedSearch}>Export CSV</Button>
          <Button size="sm" style={pill} variant="primary" onClick={() => openDraft()} disabled={!!operation}
            leftIcon={<DexIcon name="plus" size={15} />}>Add transaction</Button>
        </div>
      </header>

      <section className="dex-ledger__filters" aria-label="Transaction filters">
        <label>Currency<select value={currency} onChange={event => { setCurrency(event.target.value as LedgerCurrency); setOffset(0); }}><CurrencyOptions /></select></label>
        <label>Month<input type="month" value={month} onChange={event => { setMonth(event.target.value); setOffset(0); }} /></label>
        {month && <Button size="sm" style={pill} variant="ghost" onClick={() => { setMonth(''); setOffset(0); }}>All months</Button>}
        <label className="dex-ledger__search">Search<input type="search" placeholder="Category or description" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} /></label>
      </section>

      {notice && <div className="dex-ledger__message" role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
      {error && <div className="dex-ledger__message" role="alert">{error.message}<Button size="sm" style={pill} onClick={reload}>Retry</Button></div>}
      {!page && !error && <p className="dex-ledger__message" role="status">Loading transactions…</p>}
      {page && (
        <>
          <dl className="dex-ledger__summary" aria-label="Totals for the current view">
            <div><dt>Net</dt><dd>{format(BigInt(page.incomeMinor) - BigInt(page.expenseMinor))}</dd></div>
            <div><dt>Income</dt><dd className="dex-ledger__income">{format(page.incomeMinor)}</dd></div>
            <div><dt>Expenses</dt><dd>{format(page.expenseMinor)}</dd></div>
          </dl>
          {page.categories.length > 0 && <details className="dex-ledger__breakdown">
            <summary>Expenses by category</summary>
            <dl>{page.categories.map(category => (
              <div key={category.name}>
                <dt>{category.name}</dt><dd>{format(category.amountMinor)}</dd>
                <span aria-hidden="true"><i style={{ width: Number(BigInt(category.amountMinor) * 1000n / BigInt(page.expenseMinor)) / 10 + '%' }} /></span>
              </div>
            ))}</dl>
          </details>}
          {page.count ? (
            <>
              <div className="dex-ledger__table" tabIndex={0} role="region" aria-label="Transactions">
                <table aria-busy={loading}>
                  <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Category</th>
                    <th scope="col">Amount</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{page.entries.map(entry => (
                    <tr key={entry.id}>
                      <td><time dateTime={entry.date}>{entry.date}</time></td>
                      <td>{entry.description || '—'}</td><td>{entry.category}</td>
                      <td className={entry.kind === 'income' ? 'dex-ledger__income' : undefined}>
                        {format(BigInt(entry.amountMinor) * (entry.kind === 'income' ? 1n : -1n))}
                      </td>
                      <td><div className="dex-ledger__row-actions">
                        <IconButton ariaLabel={'Edit ' + (entry.description || entry.category)} size="sm" icon={<DexIcon name="edit" size={15} />} disabled={!!operation || loading} onClick={() => openDraft(entry)} />
                        <IconButton ariaLabel={'Delete ' + (entry.description || entry.category)} size="sm" icon={<DexIcon name="trash" size={15} />} disabled={!!operation || loading} onClick={() => void remove(entry)} />
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <footer className="dex-ledger__pagination">
                <span>{page.offset + 1}–{page.offset + page.entries.length} of {page.count}</span>
                <Button size="sm" style={pill} disabled={loading || page.offset === 0} onClick={() => setOffset(Math.max(0, page.offset - page.pageSize))}>Previous</Button>
                <Button size="sm" style={pill} disabled={loading || page.offset + page.entries.length >= page.count} onClick={() => setOffset(page.offset + page.pageSize)}>Next</Button>
              </footer>
            </>
          ) : <p className="dex-ledger__message">{month || appliedSearch ? 'No transactions match these filters.' : 'No ' + currency + ' transactions yet.'}</p>}
        </>
      )}

      <Modal open={!!draft} title={draft?.id ? 'Edit transaction' : 'Add transaction'} onClose={() => { if (!busy.current) setDraft(null); }}
        dismissOnBackdrop={!operation} dismissOnEscape={!operation} testIdPrefix="ledger-entry">
        {draft && <form className="dex-ledger__form" onSubmit={event => { event.preventDefault(); save(); }}>
          <fieldset disabled={operation === 'save'}>
            <label>Date<input autoFocus type="date" required value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
            <label>Type<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as Draft['kind'] })}>
              <option value="expense">Expense</option><option value="income">Income</option>
            </select></label>
            <label>Currency<select value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value as LedgerCurrency })}><CurrencyOptions /></select></label>
            <label>Amount<input inputMode="decimal" required value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></label>
            <label>Category<input value={draft.category} maxLength={60} onChange={event => setDraft({ ...draft, category: event.target.value })} /></label>
            <label>Description<input value={draft.description} maxLength={300} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
          </fieldset>
          {formError && <p role="alert" className="dex-ledger__message">{formError}</p>}
          <div className="dex-ledger__actions">
            <Button style={pill} disabled={!!operation} onClick={() => setDraft(null)}>Cancel</Button>
            <Button style={pill} loading={operation === 'save'} type="submit" variant="primary">Save transaction</Button>
          </div>
        </form>}
      </Modal>
      <ConfirmHost />
    </div>
  );
}
