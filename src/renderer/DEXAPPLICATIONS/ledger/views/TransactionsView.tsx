// =============================================================================
// DEX Platform — DEX Ledger transactions
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import DexIcon from '../../../components/DexIcon';
import { DexSearchInput } from '../../../styles/components';
import { ledger, LedgerError, type TxnList, type Txn } from '../ledgerApi';
import { editableFields, nextField, inlinePatch, amountDraft, type InlineField } from '../inlineEdit';
import { formatDate, parseMoneyInput, todayLocal } from '../money';
import { useLedger, useLedgerQuery, Money, Btn, IconBtn, Empty, StatusDot, errText, CategorySelect } from '../ledgerUi';

type SortKey = 'date' | 'payee' | 'account' | 'category' | 'amount' | 'status';
const PAGE = 300;

export const TransactionsView: React.FC<{ selectedId: number | null }> = ({ selectedId }) => {
  const { accounts, groups, accountFilter, categoryFilter, go, openEditor, closeEditor, toast, confirm, digits, openImport } = useLedger();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<'' | 'income' | 'expense' | 'transfer'>('');
  const [status, setStatus] = useState<'' | 'uncleared' | 'cleared' | 'reconciled'>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(PAGE);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const tableRef = useRef<HTMLTableSectionElement>(null);
  // In-table editing: one cell at a time. `settled` stops the blur that follows
  // Enter / Escape / Tab from saving a second time.
  const [cell, setCell] = useState<{ id: number; field: InlineField } | null>(null);
  const [draft, setDraft] = useState('');
  const [cellErr, setCellErr] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 200); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setChecked(new Set()); setLimit(PAGE); }, [accountFilter, categoryFilter, debounced, kind, status, from, to]);

  const filter = useMemo(() => {
    const f: Record<string, unknown> = { sort, dir, limit };
    if (accountFilter) f.accountId = accountFilter;
    if (categoryFilter !== null) f.categoryId = categoryFilter;
    if (debounced.trim()) {
      f.search = debounced.trim();
      const m = parseMoneyInput(debounced, digits);
      if (m.ok && /\d/.test(debounced) && !/[a-z]/i.test(debounced)) f.searchAmount = Math.abs(m.minor);
    }
    if (kind) f.kind = kind;
    if (status) f.status = status;
    if (from) f.from = from;
    if (to) f.to = to;
    return f;
  }, [accountFilter, categoryFilter, debounced, kind, status, from, to, sort, dir, limit, digits]);

  const q = useLedgerQuery<TxnList>(() => ledger.txns(filter), [JSON.stringify(filter)]);
  const rows = q.data?.rows || [];
  const account = accounts.find(a => a.id === accountFilter);
  const categoryName = categoryFilter === -1 ? 'Uncategorised' : groups.flatMap(g => g.categories).find(c => c.id === categoryFilter)?.name;

  const setSortKey = (k: SortKey) => {
    if (sort === k) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(k); setDir(k === 'date' || k === 'amount' ? 'desc' : 'asc'); }
  };

  const withReconciledConfirm = async (run: (confirmReconciled: boolean) => Promise<unknown>, what: string) => {
    try { await run(false); }
    catch (e) {
      if (e instanceof LedgerError && e.message.startsWith('RECONCILED')) {
        const ok = await confirm({ title: `${what} reconciled transactions?`, message: 'They were matched to a bank statement. Changing them means the account no longer matches that statement.', confirmLabel: what, tone: 'destructive' });
        if (ok) { try { await run(true); } catch (e2) { toast(errText(e2), 'error'); } }
      } else toast(errText(e), 'error');
    }
  };

  const deleteIds = async (ids: number[]) => {
    if (!ids.length) return;
    const ok = await confirm({ title: ids.length === 1 ? 'Delete this transaction?' : `Delete ${ids.length} transactions?`, message: 'Transfers are removed from both accounts. A copy is kept in the ledger history.', confirmLabel: 'Delete', tone: 'destructive' });
    if (!ok) return;
    await withReconciledConfirm(async (c) => { const r = await ledger.deleteTxns(ids, c); toast(`Deleted ${r.deleted} row${r.deleted === 1 ? '' : 's'}`, 'success'); setChecked(new Set()); }, 'Delete');
  };

  const setStatusFor = (ids: number[], s: 'uncleared' | 'cleared') =>
    withReconciledConfirm(async (c) => { await ledger.setStatus(ids, s, c); setChecked(new Set()); }, 'Change');

  const toggleStatus = (t: Txn) => setStatusFor([t.id], t.status === 'cleared' ? 'uncleared' : 'cleared');

  const exportCsv = async () => {
    try {
      const { sort: _s, dir: _d, limit: _l, ...f } = filter;
      const r = await ledger.csvExport(f);
      const s = await ledger.saveText(`ledger-${(account?.name || 'transactions').replace(/[^\w-]+/g, '-').toLowerCase()}-${todayLocal()}.csv`, r.csv);
      if (!s.canceled) toast(`Exported ${r.count} transaction${r.count === 1 ? '' : 's'}`, 'success');
    } catch (e) { toast(errText(e), 'error'); }
  };

  const focusRow = (id: number) => {
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLTableRowElement>(`tr[data-txn="${id}"]`)?.focus());
  };

  const draftFor = (t: Txn, field: InlineField): string =>
    field === 'date' ? t.date : field === 'payee' ? t.payee : field === 'amount' ? amountDraft(t.amount, digits) : String(t.categoryId ?? '');

  /** Edit a cell in place; cells a row cannot edit inline open the full editor. */
  const startEdit = (t: Txn, field: InlineField) => {
    if (!editableFields(t).includes(field)) { openEditor({ mode: 'edit', id: t.id }); return; }
    closeEditor();
    settled.current = false;
    setCellErr(null);
    setDraft(draftFor(t, field));
    setCell({ id: t.id, field });
  };

  const stopEdit = (t: Txn) => { settled.current = true; setCell(null); setCellErr(null); focusRow(t.id); };

  const saveTxn = async (t: Txn, patch: Record<string, unknown>): Promise<boolean> => {
    try { await ledger.updateTxn({ id: t.id, ...patch }); return true; }
    catch (e) {
      if (e instanceof LedgerError && e.message.startsWith('RECONCILED')) {
        const ok = await confirm({ title: 'Change a reconciled transaction?', message: 'It was matched to a bank statement. Changing it means the account no longer matches that statement.', confirmLabel: 'Change', tone: 'destructive' });
        if (!ok) return false;
        try { await ledger.updateTxn({ id: t.id, ...patch, confirmReconciled: true }); return true; } catch (e2) { toast(errText(e2), 'error'); return false; }
      }
      toast(errText(e), 'error');
      return false;
    }
  };

  /** Save the cell, then close (`then` = null) or move to the next/previous cell. */
  const commit = async (t: Txn, field: InlineField, value: string, then: 'next' | 'prev' | null) => {
    settled.current = true;
    const r = inlinePatch(t, field, value, digits);
    if (!r.ok) { settled.current = false; setCellErr(r.error); toast(r.error, 'error'); return; }
    if (r.patch && !(await saveTxn(t, r.patch))) { settled.current = false; return; }
    const to = then ? nextField(t, field, then === 'prev') : null;
    if (to) {
      // The row reloads after a save; draft from the patched values meanwhile.
      const merged = { ...t, ...(r.patch || {}) } as Txn;
      settled.current = false;
      setCellErr(null);
      setDraft(draftFor(merged, to));
      setCell({ id: t.id, field: to });
    } else stopEdit(t);
  };

  const cellKey = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, t: Txn, field: InlineField) => {
    e.stopPropagation(); // keep row shortcuts (Space, Delete, arrows) out of the box
    if (e.key === 'Escape') { e.preventDefault(); stopEdit(t); }
    else if (e.key === 'Enter') { e.preventDefault(); void commit(t, field, (e.target as HTMLInputElement).value, null); }
    else if (e.key === 'Tab') { e.preventDefault(); void commit(t, field, (e.target as HTMLInputElement).value, e.shiftKey ? 'prev' : 'next'); }
  };

  const editor = (t: Txn, field: InlineField) => {
    const common = {
      autoFocus: true,
      className: `lg-input${cellErr ? ' lg-invalid' : ''}`,
      title: cellErr || 'Enter saves, Tab moves on, Esc cancels',
      'aria-invalid': !!cellErr,
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
    };
    if (field === 'category') {
      return (
        <select {...common} aria-label="Category" value={draft}
          onChange={e => { setDraft(e.target.value); void commit(t, 'category', e.target.value, null); }}
          onKeyDown={e => cellKey(e, t, 'category')}
          onBlur={() => { if (!settled.current) stopEdit(t); }}>
          <option value="">Uncategorised</option>
          {groups.map(g => (
            <optgroup key={g.id} label={g.name}>
              {g.categories.filter(c => !c.archived || c.id === t.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      );
    }
    return (
      <input {...common}
        type={field === 'date' ? 'date' : 'text'}
        inputMode={field === 'amount' ? 'decimal' : undefined}
        aria-label={field === 'date' ? 'Date' : field === 'payee' ? 'Description' : 'Amount'}
        style={field === 'amount' ? { textAlign: 'right' } : undefined}
        value={draft}
        onChange={e => { setDraft(e.target.value); if (cellErr) setCellErr(null); }}
        onFocus={e => { if (field !== 'date') e.currentTarget.select(); }}
        onKeyDown={e => cellKey(e, t, field)}
        onBlur={e => { if (!settled.current) void commit(t, field, e.currentTarget.value, null); }}
      />
    );
  };

  const isEditing = (t: Txn, field: InlineField) => cell?.id === t.id && cell.field === field;
  const onCellDouble = (t: Txn, field: InlineField) => (e: React.MouseEvent) => { e.stopPropagation(); startEdit(t, field); };

  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, t: Txn, i: number) => {
    const rowsEl = tableRef.current?.querySelectorAll<HTMLTableRowElement>('tr[data-txn]');
    if (e.key === 'ArrowDown') { e.preventDefault(); rowsEl?.[Math.min(i + 1, rows.length - 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); rowsEl?.[Math.max(i - 1, 0)]?.focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); openEditor({ mode: 'edit', id: t.id }); }
    else if (e.key === 'F2') { e.preventDefault(); startEdit(t, editableFields(t).includes('payee') ? 'payee' : 'date'); }
    else if (e.key === ' ') { e.preventDefault(); setChecked(prev => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; }); }
    else if (e.key === 'Delete') { e.preventDefault(); deleteIds(checked.size ? [...checked] : [t.id]); }
  };

  const allChecked = rows.length > 0 && rows.every(r => checked.has(r.id));
  const sortIcon = (k: SortKey) => sort === k ? <DexIcon name={dir === 'asc' ? 'chevron-up' : 'chevron-down'} size={10} color="currentColor" /> : null;
  const head = (k: SortKey, label: string, cls = '') => (
    <th className={cls} aria-sort={sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSortKey(k)}>{label}{sortIcon(k)}</button>
    </th>
  );

  const filtersActive = !!(kind || status || from || to);

  return (
    <>
      <div className="lg-toolbar">
        <h1>{account ? account.name : 'Transactions'}</h1>
        {account && <span className="lg-sub">Balance <Money minor={account.balance} /> · Cleared <Money minor={account.clearedBalance} /></span>}
        {categoryName && (
          <span className="lg-tag">Category: {categoryName}<button type="button" className="lg-status-btn" aria-label="Clear category filter" onClick={() => go('transactions', { accountId: accountFilter, categoryId: null })}><DexIcon name="close" size={10} color="currentColor" /></button></span>
        )}
        <span className="lg-spacer" />
        <DexSearchInput
          size="sm"
          aria-label="Search transactions"
          placeholder="Search payee, notes, amount"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          style={{ width: 230, maxWidth: '100%' }}
        />
        <IconBtn icon="filter" label="Filters" active={showFilters || filtersActive} onClick={() => setShowFilters(s => !s)} />
        <Btn small icon="import" onClick={() => openImport(accountFilter ?? undefined)} className="lg-hide-xs">Import</Btn>
        <Btn small icon="export" onClick={exportCsv} className="lg-hide-xs">Export</Btn>
        {account && <Btn small onClick={() => go('reconcile', { accountId: account.id })} className="lg-hide-sm">Reconcile</Btn>}
      </div>

      {showFilters && (
        <div className="lg-toolbar" style={{ gap: 10, minHeight: 40 }} role="group" aria-label="Filters">
          <select className="lg-input" style={{ width: 150 }} aria-label="Account" value={accountFilter ?? ''} onChange={e => go('transactions', { accountId: e.target.value ? Number(e.target.value) : null, categoryId: categoryFilter })}>
            <option value="">All accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.archived ? ' (archived)' : ''}</option>)}
          </select>
          <div style={{ width: 170 }}>
            <select className="lg-input" aria-label="Category" value={categoryFilter ?? ''} onChange={e => go('transactions', { accountId: accountFilter, categoryId: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">All categories</option>
              <option value="-1">Uncategorised</option>
              {groups.map(g => <optgroup key={g.id} label={g.name}>{g.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
            </select>
          </div>
          <select className="lg-input" style={{ width: 120 }} aria-label="Type" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            <option value="">All types</option><option value="income">Money in</option><option value="expense">Money out</option><option value="transfer">Transfers</option>
          </select>
          <select className="lg-input" style={{ width: 120 }} aria-label="Status" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
            <option value="">Any status</option><option value="uncleared">Uncleared</option><option value="cleared">Cleared</option><option value="reconciled">Reconciled</option>
          </select>
          <input className="lg-input" type="date" aria-label="From date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 140 }} />
          <span className="lg-muted">to</span>
          <input className="lg-input" type="date" aria-label="To date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 140 }} />
          {filtersActive && <Btn small variant="ghost" onClick={() => { setKind(''); setStatus(''); setFrom(''); setTo(''); }}>Clear</Btn>}
        </div>
      )}

      {checked.size > 0 && (
        <div className="lg-toolbar" style={{ minHeight: 40, background: 'var(--color-accent-soft)' }} role="toolbar" aria-label="Selection">
          <span>{checked.size} selected</span>
          <Btn small onClick={() => setStatusFor([...checked], 'cleared')}>Mark cleared</Btn>
          <Btn small onClick={() => setStatusFor([...checked], 'uncleared')}>Mark uncleared</Btn>
          <BulkCategorize ids={[...checked]} rows={rows} onDone={() => setChecked(new Set())} />
          <span className="lg-spacer" />
          <Btn small variant="danger" icon="trash" onClick={() => deleteIds([...checked])}>Delete</Btn>
          <Btn small variant="ghost" onClick={() => setChecked(new Set())}>Clear selection</Btn>
        </div>
      )}

      <div className="lg-scroll">
        {q.error && <div className="lg-pad"><div className="lg-banner lg-error" role="alert">{q.error}</div></div>}
        {!q.loading && rows.length === 0 && !q.error && (
          <Empty icon="list" title={debounced || filtersActive || categoryFilter !== null ? 'No transactions match' : 'No transactions yet'}>
            {accounts.length === 0 ? 'Add an account first, then record transactions here.' : <>Press <span className="lg-kbd">Ctrl</span> <span className="lg-kbd">N</span> to add one, or import a CSV file from your bank.</>}
          </Empty>
        )}
        {rows.length > 0 && (
          <table className="lg-table" aria-label="Transactions" aria-rowcount={q.data?.total}>
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" aria-label="Select all" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map(r => r.id)))} />
                </th>
                {head('date', 'Date')}
                {head('payee', 'Description')}
                {!accountFilter && head('account', 'Account', 'lg-hide-sm')}
                {head('category', 'Category', 'lg-hide-xs')}
                {head('amount', 'Amount', 'lg-r')}
                {head('status', 'Status')}
              </tr>
            </thead>
            <tbody ref={tableRef}>
              {rows.map((t, i) => (
                <tr
                  key={t.id}
                  data-txn={t.id}
                  tabIndex={0}
                  className={selectedId === t.id ? 'lg-selected' : checked.has(t.id) ? 'lg-selected' : ''}
                  aria-selected={selectedId === t.id}
                  onClick={() => openEditor({ mode: 'edit', id: t.id })}
                  onKeyDown={e => onRowKey(e, t, i)}
                >
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${t.payee || 'transaction'}`} checked={checked.has(t.id)} onChange={() => setChecked(prev => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} />
                  </td>
                  <td className={isEditing(t, 'date') ? 'lg-cell-edit' : 'lg-num lg-muted'} style={{ width: 100 }} onDoubleClick={onCellDouble(t, 'date')}>
                    {isEditing(t, 'date') ? editor(t, 'date') : formatDate(t.date)}
                  </td>
                  {isEditing(t, 'payee') ? <td className="lg-cell-edit">{editor(t, 'payee')}</td> : <td title={t.memo || undefined} onDoubleClick={onCellDouble(t, 'payee')}>
                    {t.isTransfer
                      ? <span><DexIcon name="shuffle" size={11} color="var(--color-text-tertiary)" /> {t.amount < 0 ? 'To' : 'From'} {t.transferAccountName}</span>
                      : (t.payee || <span className="lg-muted">No description</span>)}
                    {t.memo && <span className="lg-muted"> · {t.memo}</span>}
                    {t.attachmentCount > 0 && <span className="lg-muted" title="Has a receipt"> <DexIcon name="paperclip" size={11} color="currentColor" /></span>}
                  </td>}
                  {!accountFilter && <td className="lg-muted lg-hide-sm">{t.accountName}</td>}
                  <td className={`lg-hide-xs${isEditing(t, 'category') ? ' lg-cell-edit' : ''}`} onDoubleClick={onCellDouble(t, 'category')}>
                    {isEditing(t, 'category') ? editor(t, 'category') : t.isTransfer ? <span className="lg-muted">Transfer</span>
                      : t.isSplit ? <span className="lg-tag">Split · {t.splitCount}</span>
                      : t.categoryName ? t.categoryName
                      : <span style={{ color: 'var(--color-warning, #ff9f0a)' }}>Uncategorised</span>}
                  </td>
                  <td className={`lg-r${isEditing(t, 'amount') ? ' lg-cell-edit' : ''}`} style={{ width: 120 }} onDoubleClick={onCellDouble(t, 'amount')}>
                    {isEditing(t, 'amount') ? editor(t, 'amount') : <Money minor={t.amount} tone="auto" />}
                  </td>
                  <td style={{ width: 56 }}><StatusDot status={t.status} onToggle={() => toggleStatus(t)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {q.data && q.data.total > rows.length && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
            <Btn small onClick={() => setLimit(l => l + PAGE)}>Show more ({q.data.total - rows.length} more)</Btn>
          </div>
        )}
      </div>
      {q.data && (
        <div className="lg-footer">
          <span className="lg-muted">{q.data.total} transaction{q.data.total === 1 ? '' : 's'}</span>
          <span className="lg-spacer" />
          <span className="lg-muted">Total</span> <Money minor={q.data.sum} sign />
        </div>
      )}
    </>
  );
};

const BulkCategorize: React.FC<{ ids: number[]; rows: Txn[]; onDone: () => void }> = ({ ids, rows, onDone }) => {
  const { groups, toast } = useLedger();
  const [open, setOpen] = useState(false);
  const eligible = ids.filter(id => { const r = rows.find(x => x.id === id); return r && !r.isTransfer && !r.isSplit; });
  if (!open) return <Btn small disabled={!eligible.length} onClick={() => setOpen(true)}>Set category…</Btn>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', width: 260 }}>
      <CategorySelect value={null} groups={groups} ariaLabel="Category for selected" noneLabel="Choose a category"
        onChange={async (cat) => {
          if (cat === null) return;
          try {
            await ledger.categorize(eligible, cat);
            toast(`Categorised ${eligible.length} transaction${eligible.length === 1 ? '' : 's'}`, 'success');
            setOpen(false); onDone();
          } catch (e) { toast(errText(e), 'error'); }
        }} />
      <Btn small variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
    </span>
  );
};
