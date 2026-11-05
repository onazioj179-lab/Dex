// =============================================================================
// DEX Platform - LEDGER (local-first personal finance)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// Accounts, transactions (with splits and transfers), monthly budgets,
// reconciliation, reports, CSV import/export and backup/restore. All money is
// integer minor units (./ledgerModel.ts, unit-tested); the packaged app keeps
// the ledger in SQLite. No sample or invented records: a new ledger is empty.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/appShell';
import type { MenuGroup } from '../../components/appShell/menuTypes';
import { colors, radius, fontStack } from '../../styles/tokens';
import { downloadText } from '../../improvements500/downloadBlob';
import {
  ACCOUNT_TYPES, addMonths, addTransaction, addTransfer, accountBalance, budgetMonth, deleteAccount, deleteCategory,
  deleteTransaction, emptyLedger, exportTransactionsCsv, finishReconcile, formatMinor, importTransactionsCsv, isTransfer,
  monthOf, monthSummary, netWorth, newId, parseAmount, reconcileState, setBudget, txnAmount,
  updateTransaction, validateLedger, type Account, type AccountType, type Category, type LedgerDoc, type Split,
  type Transaction, type TxnStatus,
} from './ledgerModel';
import { loadLedger, saveLedger, type LedgerBackend } from './ledgerStorage';

// ---------------------------------------------------------------------------
// Style primitives
// ---------------------------------------------------------------------------

const hair = '1px solid var(--color-border-subtle)';
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.text.tertiary };
const inp: React.CSSProperties = {
  height: 26, padding: '0 8px', fontSize: 12, color: colors.text.primary, background: 'var(--color-bg-inset)',
  border: hair, borderRadius: radius.sm, outline: 'none', fontFamily: fontStack.ui, minWidth: 0,
};
const btn: React.CSSProperties = {
  height: 26, padding: '0 10px', fontSize: 12, fontWeight: 500, borderRadius: radius.sm, border: hair,
  background: 'var(--color-bg-surface)', color: colors.text.primary, cursor: 'pointer', whiteSpace: 'nowrap',
};
const primary: React.CSSProperties = { ...btn, background: colors.accent.default, borderColor: 'transparent', color: 'var(--color-accent-text, #fff)' };
const th: React.CSSProperties = { ...cap, textAlign: 'left', padding: '6px 10px', borderBottom: hair, position: 'sticky', top: 0, background: 'var(--color-bg-base)', zIndex: 1 };
const td: React.CSSProperties = { padding: '4px 10px', borderBottom: hair, fontSize: 12, whiteSpace: 'nowrap' };
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

type Section = 'overview' | 'budget' | 'transactions' | 'reconcile' | 'reports' | 'categories';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'budget', label: 'Budget' }, { id: 'transactions', label: 'Transactions' },
  { id: 'reconcile', label: 'Reconcile' }, { id: 'reports', label: 'Reports' }, { id: 'categories', label: 'Categories' },
];

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const Money: React.FC<{ v: number; cur: string; sign?: boolean; muted?: boolean }> = ({ v, cur, sign, muted }) => (
  <span style={{ color: muted && v === 0 ? colors.text.tertiary : v < 0 ? colors.semantic.error : colors.text.primary, fontVariantNumeric: 'tabular-nums' }}>{formatMinor(v, cur, { sign })}</span>
);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const Ledger: React.FC = () => {
  const [doc, setDoc] = useState<LedgerDoc | null>(null);
  const [backend, setBackend] = useState<LedgerBackend>('browser');
  const [past, setPast] = useState<LedgerDoc[]>([]);
  const [future, setFuture] = useState<LedgerDoc[]>([]);
  const [section, setSection] = useState<Section>('overview');
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string }>({ ok: true, text: '' });
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [addingAccount, setAddingAccount] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    void loadLedger().then((r) => {
      setDoc(r.doc); setBackend(r.backend); loaded.current = true;
      if (r.error) setNotice({ kind: 'error', text: r.error });
    });
  }, []);

  // Persist (debounced). The first effect run after loading is the loaded doc itself.
  const skipFirst = useRef(true);
  useEffect(() => {
    if (!doc || !loaded.current) return;
    if (skipFirst.current) { skipFirst.current = false; return; }
    const t = setTimeout(() => {
      void saveLedger(doc).then((r) => setSaveMsg(r.ok ? { ok: true, text: backend === 'sqlite' ? 'Saved' : 'Saved in this browser (preview)' } : { ok: false, text: `Not saved: ${r.error}` }));
    }, 350);
    return () => clearTimeout(t);
  }, [doc, backend]);

  /** Apply a change with undo; domain errors surface as a notice, never a crash. */
  const commit = useCallback((fn: (d: LedgerDoc) => LedgerDoc, okText?: string) => {
    setDoc((d) => {
      if (!d) return d;
      try {
        const next = fn(d);
        if (next === d) return d;
        setPast((p) => [...p.slice(-49), d]); setFuture([]);
        if (okText) setNotice({ kind: 'info', text: okText });
        return next;
      } catch (e) {
        setNotice({ kind: 'error', text: (e as Error).message });
        return d;
      }
    });
  }, []);
  const undo = useCallback(() => { if (!past.length || !doc) return; setFuture((f) => [doc, ...f]); setDoc(past[past.length - 1]); setPast((p) => p.slice(0, -1)); }, [past, doc]);
  const redo = useCallback(() => { if (!future.length || !doc) return; setPast((p) => [...p, doc]); setDoc(future[0]); setFuture((f) => f.slice(1)); }, [future, doc]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (!typing && !mod && (section === 'budget' || section === 'reports') && (e.key === '[' || e.key === ']')) setMonth((m) => addMonths(m, e.key === '[' ? -1 : 1));
      else if (!typing && e.key === 'Delete' && selected && section === 'transactions') { commit((d) => deleteTransaction(d, selected)); setSelected(null); }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [undo, redo, section, selected, commit]);

  const importCsv = useCallback(async (file: File, accountId: string) => {
    const text = await file.text();
    const res = importTransactionsCsv(text, 'mdy');
    if (!res.rows.length) { setNotice({ kind: 'error', text: res.errors[0] ?? 'Nothing to import.' }); return; }
    commit((d) => {
      const byName = new Map(d.categories.map((c) => [c.name.toLowerCase(), c.id]));
      let next = d;
      for (const r of res.rows) {
        next = addTransaction(next, { date: r.date, accountId, payee: r.payee, memo: r.memo, splits: [{ categoryId: byName.get(r.category.toLowerCase()) ?? null, amountMinor: r.amountMinor, memo: '' }] });
      }
      return next;
    }, `Imported ${res.rows.length} transaction(s)${res.errors.length ? `; skipped ${res.errors.length}: ${res.errors.slice(0, 3).join(' ')}` : ''}. Undo removes them.`);
  }, [commit]);

  const restore = useCallback(async (file: File) => {
    try {
      const next = validateLedger(JSON.parse(await file.text()));
      commit(() => next, `Restored ${next.accounts.length} accounts and ${next.transactions.length} transactions. Undo returns the previous ledger.`);
    } catch (e) { setNotice({ kind: 'error', text: `Restore failed: ${(e as Error).message}` }); }
  }, [commit]);

  if (!doc) return <div style={{ padding: 24, color: colors.text.secondary, fontSize: 12 }}>Opening ledger…</div>;
  const cur = doc.currency;
  const txnSel = doc.transactions.find((t) => t.id === selected) ?? null;
  const pendingImport = accountFilter ?? doc.accounts.find((a) => !a.closed)?.id ?? null;

  const menus: MenuGroup[] = [
    { id: 'file', label: 'File', sections: [
      { id: 'io', items: [
        { id: 'f.import', label: pendingImport ? `Import CSV into ${doc.accounts.find((a) => a.id === pendingImport)?.name}…` : 'Import CSV… (add an account first)', disabled: !pendingImport, run: () => csvInput.current?.click() },
        { id: 'f.export', label: accountFilter ? 'Export this account (CSV)' : 'Export all transactions (CSV)', disabled: !doc.transactions.length, run: () => downloadText(`ledger-${accountFilter ? doc.accounts.find((a) => a.id === accountFilter)?.name ?? 'account' : 'all'}-${today()}.csv`, exportTransactionsCsv(doc, accountFilter ?? undefined), 'text/csv;charset=utf-8') },
      ] },
      { id: 'backup', label: 'Backup', items: [
        { id: 'f.backup', label: 'Back up ledger…', run: () => downloadText(`dex-ledger-backup-${today()}.json`, JSON.stringify(doc, null, 2), 'application/json;charset=utf-8') },
        { id: 'f.restore', label: 'Restore from backup…', run: () => restoreInput.current?.click() },
      ] },
    ] },
    { id: 'edit', label: 'Edit', sections: [{ id: 'h', items: [
      { id: 'e.undo', label: 'Undo', shortcut: 'Ctrl+Z', disabled: !past.length, run: undo },
      { id: 'e.redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: !future.length, run: redo },
    ] }] },
    { id: 'view', label: 'View', sections: [{ id: 's', items: SECTIONS.map((s) => ({ id: `v.${s.id}`, label: s.label, checked: section === s.id, run: () => setSection(s.id) })) }] },
  ];

  const groups = ['Cash', 'Credit', 'Tracking'] as const;
  const sidebar = (
    <nav aria-label="Ledger" style={{ width: 220, flexShrink: 0, borderRight: hair, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
      <div style={{ padding: '8px 6px' }}>
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => { setSection(s.id); if (s.id !== 'transactions' && s.id !== 'reconcile') setAccountFilter(null); }}
            aria-current={section === s.id && (!accountFilter || s.id === 'reconcile') ? 'page' : undefined}
            style={{ display: 'block', width: '100%', textAlign: 'left', height: 26, padding: '0 8px', fontSize: 12, border: 'none', borderRadius: radius.sm, cursor: 'pointer',
              background: section === s.id && !accountFilter ? colors.accent.light : 'transparent', color: section === s.id && !accountFilter ? colors.accent.default : colors.text.primary }}>{s.label}</button>
        ))}
      </div>
      {groups.map((g) => {
        const accts = doc.accounts.filter((a) => ACCOUNT_TYPES.find((t) => t.id === a.type)?.group === g && !a.closed);
        if (!accts.length) return null;
        const total = accts.reduce((s, a) => s + accountBalance(doc, a.id), 0);
        return (
          <details key={g} open style={{ padding: '0 6px 4px' }}>
            <summary style={{ ...cap, display: 'flex', padding: '6px 8px', cursor: 'pointer', listStyle: 'none' }}>
              <span style={{ flex: 1 }}>{g}</span><Money v={total} cur={cur} />
            </summary>
            {accts.map((a) => (
              <button key={a.id} onClick={() => { setAccountFilter(a.id); setSection(section === 'reconcile' ? 'reconcile' : 'transactions'); }}
                style={{ display: 'flex', width: '100%', height: 26, alignItems: 'center', gap: 6, padding: '0 8px 0 16px', fontSize: 12, border: 'none', borderRadius: radius.sm, cursor: 'pointer',
                  background: accountFilter === a.id ? colors.accent.light : 'transparent', color: accountFilter === a.id ? colors.accent.default : colors.text.primary }}>
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                <Money v={accountBalance(doc, a.id)} cur={cur} />
              </button>
            ))}
          </details>
        );
      })}
      <div style={{ padding: '6px 12px' }}>
        {addingAccount
          ? <AccountForm cur={cur} onCancel={() => setAddingAccount(false)} onSave={(a) => { commit((d) => ({ ...d, accounts: [...d.accounts, a] }), `Added ${a.name}.`); setAddingAccount(false); }} />
          : <button style={{ ...btn, width: '100%' }} onClick={() => setAddingAccount(true)}>Add account</button>}
      </div>
      {doc.accounts.some((a) => a.closed) && (
        <details style={{ padding: '0 12px 8px', fontSize: 12, color: colors.text.secondary }}>
          <summary style={{ cursor: 'pointer' }}>Closed accounts</summary>
          {doc.accounts.filter((a) => a.closed).map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
              <span style={{ flex: 1 }}>{a.name}</span>
              <button style={{ ...btn, height: 20, fontSize: 11 }} onClick={() => commit((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === a.id ? { ...x, closed: false } : x)) }))}>Reopen</button>
            </div>
          ))}
        </details>
      )}
      <div style={{ marginTop: 'auto', padding: '8px 12px', borderTop: hair, fontSize: 12, display: 'flex' }}>
        <span style={{ flex: 1, color: colors.text.secondary }}>Net worth</span><Money v={netWorth(doc)} cur={cur} />
      </div>
    </nav>
  );

  const inspector = section === 'transactions' && txnSel ? (
    <TxnInspector key={txnSel.id} doc={doc} t={txnSel} onClose={() => setSelected(null)}
      onPatch={(patch) => commit((d) => updateTransaction(d, txnSel.id, patch))}
      onDelete={() => { commit((d) => deleteTransaction(d, txnSel.id), 'Transaction deleted. Undo restores it.'); setSelected(null); }} />
  ) : undefined;

  return (
    <div ref={rootRef} style={{ height: '100%' }}>
      <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f && pendingImport) void importCsv(f, pendingImport); e.target.value = ''; }} />
      <input ref={restoreInput} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ''; }} />
      <AppShell appId="ledger" title="Ledger" menus={menus} surface="plain" inspector={inspector} inspectorWidth={280}
        toolbar={<div style={{ display: 'flex', gap: 4 }}>
          <button style={btn} disabled={!past.length} onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button style={btn} disabled={!future.length} onClick={redo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        </div>}
        status={{
          left: <span>{doc.accounts.length} account{doc.accounts.length === 1 ? '' : 's'} · {doc.transactions.length} transaction{doc.transactions.length === 1 ? '' : 's'}</span>,
          right: <span style={{ color: saveMsg.ok ? colors.text.tertiary : colors.semantic.error }}>{saveMsg.text || (backend === 'sqlite' ? 'Stored in DEX database' : 'Preview: stored in this browser')}</span>,
        }}>
        <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
          {sidebar}
          <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {notice && (
              <div role={notice.kind === 'error' ? 'alert' : 'status'} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 12px', fontSize: 12, borderBottom: hair,
                background: notice.kind === 'error' ? colors.semantic.errorMuted : colors.accent.soft, color: notice.kind === 'error' ? colors.semantic.error : colors.text.primary }}>
                <span style={{ flex: 1 }}>{notice.text}</span>
                <button style={{ ...btn, height: 20, fontSize: 11 }} onClick={() => setNotice(null)}>Dismiss</button>
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {!doc.accounts.length && section !== 'categories' ? (
                <Welcome categoryCount={doc.categories.length} onAddAccount={() => setAddingAccount(true)}
                  onCategories={() => setSection('categories')}
                  onCurrency={(c) => commit((d) => ({ ...d, currency: c }))} currency={cur} />
              ) : section === 'overview' ? <Overview doc={doc} month={month} onOpen={(id) => { setAccountFilter(id); setSection('transactions'); }} />
                : section === 'budget' ? <BudgetView doc={doc} month={month} setMonth={setMonth} onSet={(cid, v) => commit((d) => setBudget(d, month, cid, v))} />
                : section === 'transactions' ? <Transactions doc={doc} accountId={accountFilter} selected={selected} onSelect={setSelected} commit={commit} />
                : section === 'reconcile' ? <Reconcile doc={doc} accountId={accountFilter} setAccount={setAccountFilter} commit={commit} />
                : section === 'reports' ? <Reports doc={doc} month={month} setMonth={setMonth} />
                : <Categories doc={doc} commit={commit} />}
            </div>
          </main>
        </div>
      </AppShell>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const Head: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: hair }}>
    <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{title}</span>{children}
  </div>
);
const MonthNav: React.FC<{ month: string; setMonth: (fn: (m: string) => string) => void }> = ({ month, setMonth }) => (
  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
    <button style={btn} onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month" title="Previous month ([)">‹</button>
    <span style={{ fontSize: 12, minWidth: 120, textAlign: 'center' }}>{monthLabel(month)}</span>
    <button style={btn} onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month" title="Next month (])">›</button>
  </span>
);

const AccountForm: React.FC<{ cur: string; onSave: (a: Account) => void; onCancel: () => void }> = ({ onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [bal, setBal] = useState('0');
  const [date, setDate] = useState(today());
  const parsed = parseAmount(bal);
  const valid = name.trim() && parsed !== null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!valid) return; const neg = type === 'credit' || type === 'loan'; onSave({ id: newId('a'), name: name.trim(), type, openingMinor: neg ? -Math.abs(parsed!) : parsed!, openingDate: date, closed: false }); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input autoFocus aria-label="Account name" placeholder="Account name" style={inp} value={name} onChange={(e) => setName(e.target.value)} />
      <select aria-label="Account type" style={inp} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
        {ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <label style={{ fontSize: 11, color: colors.text.secondary }}>{type === 'credit' || type === 'loan' ? 'Amount owed today' : 'Balance today'}
        <input aria-label="Opening balance" inputMode="decimal" style={{ ...inp, width: '100%', marginTop: 2 }} value={bal} onChange={(e) => setBal(e.target.value)} />
      </label>
      <input aria-label="Opening date" type="date" style={inp} value={date} onChange={(e) => setDate(e.target.value)} />
      {parsed === null && <span style={{ fontSize: 11, color: colors.semantic.warning }}>Enter an amount like 1250.00</span>}
      <div style={{ display: 'flex', gap: 6 }}><button type="submit" style={{ ...primary, flex: 1 }} disabled={!valid}>Add</button><button type="button" style={btn} onClick={onCancel}>Cancel</button></div>
    </form>
  );
};

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'NGN'];

const Welcome: React.FC<{ categoryCount: number; currency: string; onAddAccount: () => void; onCategories: () => void; onCurrency: (c: string) => void }> = ({ categoryCount, currency, onAddAccount, onCategories, onCurrency }) => (
  <div style={{ maxWidth: 460, margin: '48px auto', padding: '0 20px', fontSize: 13, color: colors.text.secondary, lineHeight: 1.6 }}>
    <div style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary, marginBottom: 6 }}>Set up your ledger</div>
    Your ledger is empty. Add the accounts you hold with today&rsquo;s balances; everything stays on this computer.
    <ol style={{ paddingLeft: 18, margin: '12px 0' }}>
      <li>Currency: <select aria-label="Currency" style={{ ...inp, marginLeft: 6 }} value={currency} onChange={(e) => onCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></li>
      <li>Categories: {categoryCount ? `${categoryCount} set up. ` : 'none yet. '}<button style={{ ...btn, marginLeft: 6 }} onClick={onCategories}>Create categories</button></li>
      <li>Accounts: <button style={{ ...primary, marginLeft: 6 }} onClick={onAddAccount}>Add an account</button></li>
    </ol>
    Then import a bank CSV (File › Import CSV) or add transactions by hand.
  </div>
);

const Overview: React.FC<{ doc: LedgerDoc; month: string; onOpen: (id: string) => void }> = ({ doc, month, onOpen }) => {
  const cur = doc.currency;
  const s = monthSummary(doc, month);
  const prev = monthSummary(doc, addMonths(month, -1));
  const b = budgetMonth(doc, month);
  const over = b.rows.filter((r) => r.availableMinor < 0);
  const recent = [...doc.transactions].sort((a, z) => z.date.localeCompare(a.date) || z.createdAt - a.createdAt).slice(0, 10);
  const cat = new Map(doc.categories.map((c) => [c.id, c.name]));
  return (
    <div>
      <Head title={`Overview · ${monthLabel(month)}`} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>This month</th><th style={{ ...th, textAlign: 'right' }}>{monthLabel(month)}</th><th style={{ ...th, textAlign: 'right' }}>{monthLabel(addMonths(month, -1))}</th></tr></thead>
        <tbody>
          <tr><td style={td}>Income</td><td style={num}><Money v={s.incomeMinor} cur={cur} /></td><td style={num}><Money v={prev.incomeMinor} cur={cur} /></td></tr>
          <tr><td style={td}>Spending</td><td style={num}><Money v={s.expenseMinor} cur={cur} /></td><td style={num}><Money v={prev.expenseMinor} cur={cur} /></td></tr>
          <tr><td style={{ ...td, fontWeight: 600 }}>Net</td><td style={num}><Money v={s.netMinor} cur={cur} sign /></td><td style={num}><Money v={prev.netMinor} cur={cur} sign /></td></tr>
          {s.uncategorizedMinor !== 0 && <tr><td style={{ ...td, color: colors.semantic.warning }}>Uncategorized</td><td style={num}><Money v={s.uncategorizedMinor} cur={cur} /></td><td style={num} /></tr>}
        </tbody>
      </table>
      <div style={{ ...cap, padding: '14px 14px 4px' }}>Accounts</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {doc.accounts.filter((a) => !a.closed).map((a) => (
            <tr key={a.id} onClick={() => onOpen(a.id)} style={{ cursor: 'pointer' }} className="dex-hover-bg">
              <td style={td}>{a.name}</td><td style={{ ...td, color: colors.text.tertiary }}>{ACCOUNT_TYPES.find((t) => t.id === a.type)?.label}</td>
              <td style={{ ...num, color: colors.text.tertiary }}>cleared {formatMinor(accountBalance(doc, a.id, { clearedOnly: true }), cur)}</td>
              <td style={num}><Money v={accountBalance(doc, a.id)} cur={cur} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {over.length > 0 && <>
        <div style={{ ...cap, padding: '14px 14px 4px', color: colors.semantic.warning }}>Overspent categories</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          {over.map((r) => <tr key={r.categoryId}><td style={td}>{cat.get(r.categoryId)}</td><td style={num}><Money v={r.availableMinor} cur={cur} /></td></tr>)}
        </tbody></table>
      </>}
      <div style={{ ...cap, padding: '14px 14px 4px' }}>Recent</div>
      {recent.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          {recent.map((t) => <tr key={t.id}><td style={{ ...td, color: colors.text.secondary }}>{t.date}</td><td style={td}>{t.payee || '—'}</td><td style={{ ...td, color: colors.text.tertiary }}>{isTransfer(t) ? 'Transfer' : t.splits.length > 1 ? 'Split' : cat.get(t.splits[0]?.categoryId ?? '') ?? 'Uncategorized'}</td><td style={num}><Money v={txnAmount(t)} cur={cur} sign /></td></tr>)}
        </tbody></table>
      ) : <div style={{ padding: '4px 14px', fontSize: 12, color: colors.text.tertiary }}>No transactions yet.</div>}
    </div>
  );
};

const AmountCell: React.FC<{ value: number; cur: string; onCommit: (v: number) => void; ariaLabel: string }> = ({ value, onCommit, ariaLabel }) => {
  const fmt = (v: number) => (v === 0 ? '' : `${v < 0 ? '-' : ''}${Math.floor(Math.abs(v) / 100)}.${String(Math.abs(v) % 100).padStart(2, '0')}`);
  const [draft, setDraft] = useState(fmt(value));
  useEffect(() => setDraft(fmt(value)), [value]);
  const bad = draft.trim() !== '' && parseAmount(draft) === null;
  return (
    <input aria-label={ariaLabel} inputMode="decimal" value={draft} placeholder="0.00" onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { const p = draft.trim() === '' ? 0 : parseAmount(draft); if (p !== null && p !== value) onCommit(p); else if (p === null) setDraft(fmt(value)); }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      style={{ ...inp, width: 96, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderColor: bad ? colors.semantic.warning : undefined }} />
  );
};

const BudgetView: React.FC<{ doc: LedgerDoc; month: string; setMonth: (fn: (m: string) => string) => void; onSet: (cid: string, v: number) => void }> = ({ doc, month, setMonth, onSet }) => {
  const cur = doc.currency;
  const b = budgetMonth(doc, month);
  const groups = [...new Set(doc.categories.filter((c) => c.kind === 'expense' && !c.archived).map((c) => c.group || 'Other'))];
  const byId = new Map(doc.categories.map((c) => [c.id, c]));
  const remaining = b.incomeMinor - b.budgetedMinor;
  return (
    <div>
      <Head title="Budget"><MonthNav month={month} setMonth={setMonth} /></Head>
      <div style={{ display: 'flex', gap: 18, padding: '8px 14px', fontSize: 12, borderBottom: hair, color: colors.text.secondary }}>
        <span>Income this month <Money v={b.incomeMinor} cur={cur} /></span>
        <span>Budgeted <Money v={b.budgetedMinor} cur={cur} /></span>
        <span>Left to budget <Money v={remaining} cur={cur} /></span>
        <span style={{ marginLeft: 'auto', color: colors.text.tertiary }}>Budgets are plans; they never change account balances.</span>
      </div>
      {!b.rows.length ? <div style={{ padding: 20, fontSize: 12, color: colors.text.tertiary }}>Add expense categories in Categories to start budgeting.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Category</th><th style={{ ...th, textAlign: 'right' }}>Budgeted</th><th style={{ ...th, textAlign: 'right' }}>Activity</th><th style={{ ...th, textAlign: 'right' }}>Available</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g}>
                <tr><td colSpan={4} style={{ ...td, ...cap, background: 'var(--color-bg-surface)' }}>{g}</td></tr>
                {b.rows.filter((r) => (byId.get(r.categoryId)?.group || 'Other') === g).map((r) => (
                  <tr key={r.categoryId}>
                    <td style={{ ...td, paddingLeft: 20 }}>{byId.get(r.categoryId)?.name}</td>
                    <td style={{ ...num, padding: '2px 10px' }}><AmountCell ariaLabel={`Budget for ${byId.get(r.categoryId)?.name}`} value={r.budgetedMinor} cur={cur} onCommit={(v) => onSet(r.categoryId, v)} /></td>
                    <td style={num}><Money v={r.activityMinor} cur={cur} muted /></td>
                    <td style={num}><span style={{ padding: '1px 6px', borderRadius: radius.xs, background: r.availableMinor < 0 ? colors.semantic.errorMuted : 'transparent' }}><Money v={r.availableMinor} cur={cur} muted /></span></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

type Commit = (fn: (d: LedgerDoc) => LedgerDoc, okText?: string) => void;

const NewTxnRow: React.FC<{ doc: LedgerDoc; accountId: string | null; commit: Commit }> = ({ doc, accountId, commit }) => {
  const open = doc.accounts.filter((a) => !a.closed);
  const [acct, setAcct] = useState(accountId ?? open[0]?.id ?? '');
  useEffect(() => { if (accountId) setAcct(accountId); }, [accountId]);
  const [date, setDate] = useState(today());
  const [payee, setPayee] = useState('');
  const [cat, setCat] = useState('');
  const [dir, setDir] = useState<'out' | 'in'>('out');
  const [amt, setAmt] = useState('');
  const parsed = parseAmount(amt);
  const ok = acct && parsed !== null && parsed !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const submit = () => {
    if (!ok) return;
    const v = Math.abs(parsed!);
    if (cat.startsWith('xfer:')) {
      const other = cat.slice(5);
      commit((d) => (dir === 'out' ? addTransfer(d, acct, other, v, date, '') : addTransfer(d, other, acct, v, date, '')));
    } else {
      commit((d) => addTransaction(d, { date, accountId: acct, payee: payee.trim(), memo: '', splits: [{ categoryId: cat || null, amountMinor: dir === 'out' ? -v : v, memo: '' }], status: 0 }));
    }
    setPayee(''); setAmt('');
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: hair, flexWrap: 'wrap', alignItems: 'center' }} aria-label="New transaction">
      <input aria-label="Date" type="date" style={inp} value={date} onChange={(e) => setDate(e.target.value)} />
      {!accountId && <select aria-label="Account" style={inp} value={acct} onChange={(e) => setAcct(e.target.value)}>{open.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
      <input aria-label="Payee" placeholder="Payee" style={{ ...inp, flex: 1, minWidth: 120 }} value={payee} onChange={(e) => setPayee(e.target.value)} />
      <select aria-label="Category" style={{ ...inp, maxWidth: 180 }} value={cat} onChange={(e) => setCat(e.target.value)}>
        <option value="">Uncategorized</option>
        {doc.categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.group ? `${c.group}: ` : ''}{c.name}</option>)}
        <optgroup label="Transfer">{open.filter((a) => a.id !== acct).map((a) => <option key={a.id} value={`xfer:${a.id}`}>{dir === 'out' ? 'To' : 'From'} {a.name}</option>)}</optgroup>
      </select>
      <span role="radiogroup" aria-label="Direction" style={{ display: 'flex' }}>
        {(['out', 'in'] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={dir === d} onClick={() => setDir(d)}
            style={{ ...btn, borderRadius: d === 'out' ? `${radius.sm}px 0 0 ${radius.sm}px` : `0 ${radius.sm}px ${radius.sm}px 0`, background: dir === d ? colors.accent.light : btn.background, color: dir === d ? colors.accent.default : colors.text.secondary }}>
            {d === 'out' ? 'Outflow' : 'Inflow'}
          </button>
        ))}
      </span>
      <input aria-label="Amount" inputMode="decimal" placeholder="0.00" style={{ ...inp, width: 96, textAlign: 'right' }} value={amt} onChange={(e) => setAmt(e.target.value)} />
      <button type="submit" style={primary} disabled={!ok}>Add</button>
    </form>
  );
};

const STATUS_LABEL = ['Uncleared', 'Cleared', 'Reconciled'];

const Transactions: React.FC<{ doc: LedgerDoc; accountId: string | null; selected: string | null; onSelect: (id: string | null) => void; commit: Commit }> = ({ doc, accountId, selected, onSelect, commit }) => {
  const cur = doc.currency;
  const [q, setQ] = useState('');
  const acct = doc.accounts.find((a) => a.id === accountId) ?? null;
  const catName = useMemo(() => new Map(doc.categories.map((c) => [c.id, c.name])), [doc.categories]);
  const acctName = useMemo(() => new Map(doc.accounts.map((a) => [a.id, a.name])), [doc.accounts]);
  // Running balance (account view only), oldest first, then shown newest first.
  const rows = useMemo(() => {
    const list = doc.transactions.filter((t) => !accountId || t.accountId === accountId).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    let run = acct?.openingMinor ?? 0;
    const withBal = list.map((t) => { run += txnAmount(t); return { t, bal: run }; });
    const needle = q.trim().toLowerCase();
    return withBal.reverse().filter(({ t }) => !needle || t.payee.toLowerCase().includes(needle) || t.memo.toLowerCase().includes(needle) || t.splits.some((s) => (catName.get(s.categoryId ?? '') ?? '').toLowerCase().includes(needle)));
  }, [doc.transactions, accountId, acct, q, catName]);
  const cycle = (t: Transaction) => commit((d) => updateTransaction(d, t.id, { status: (t.status === 0 ? 1 : 0) as TxnStatus }));
  return (
    <div>
      <Head title={acct ? acct.name : 'All transactions'}>
        <input aria-label="Search transactions" placeholder="Search" style={{ ...inp, width: 180 }} value={q} onChange={(e) => setQ(e.target.value)} />
        {acct && <>
          <button style={btn} onClick={() => commit((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === acct.id ? { ...a, closed: true } : a)) }), `${acct.name} closed. Its history stays; reopen it from Closed accounts.`)}>Close account</button>
          {!doc.transactions.some((t) => t.accountId === acct.id || t.transferAccountId === acct.id) && <button style={btn} onClick={() => commit((d) => deleteAccount(d, acct.id))}>Delete</button>}
        </>}
      </Head>
      {doc.accounts.some((a) => !a.closed) && <NewTxnRow doc={doc} accountId={accountId} commit={commit} />}
      {!rows.length ? <div style={{ padding: 20, fontSize: 12, color: colors.text.tertiary }}>{q ? 'No matches.' : 'No transactions yet. Add one above or import a bank CSV from the File menu.'}</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...th, width: 24 }} aria-label="Cleared" />
            <th style={th}>Date</th>{!accountId && <th style={th}>Account</th>}<th style={th}>Payee</th><th style={th}>Category</th><th style={th}>Memo</th>
            <th style={{ ...th, textAlign: 'right' }}>Amount</th>{accountId && <th style={{ ...th, textAlign: 'right' }}>Balance</th>}
          </tr></thead>
          <tbody>
            {rows.slice(0, 2000).map(({ t, bal }) => {
              const sel = t.id === selected;
              return (
                <tr key={t.id} onClick={() => onSelect(sel ? null : t.id)} aria-selected={sel} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSelect(t.id); if (e.key === ' ') { e.preventDefault(); if (t.status !== 2) cycle(t); } }}
                  style={{ cursor: 'pointer', background: sel ? colors.accent.soft : undefined }}>
                  <td style={td}>
                    <button aria-label={`${STATUS_LABEL[t.status]}; toggle cleared`} title={STATUS_LABEL[t.status]} disabled={t.status === 2}
                      onClick={(e) => { e.stopPropagation(); cycle(t); }}
                      style={{ width: 14, height: 14, borderRadius: '50%', padding: 0, cursor: t.status === 2 ? 'default' : 'pointer',
                        border: `1.5px solid ${t.status ? colors.accent.default : 'var(--color-text-tertiary)'}`, background: t.status === 2 ? colors.accent.default : t.status === 1 ? colors.accent.light : 'transparent' }} />
                  </td>
                  <td style={{ ...td, color: colors.text.secondary }}>{t.date}</td>
                  {!accountId && <td style={td}>{acctName.get(t.accountId)}</td>}
                  <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.payee || '—'}</td>
                  <td style={{ ...td, color: isTransfer(t) ? colors.text.secondary : t.splits.some((s) => !s.categoryId) ? colors.semantic.warning : colors.text.primary }}>
                    {isTransfer(t) ? `Transfer ${txnAmount(t) < 0 ? 'to' : 'from'} ${acctName.get(t.transferAccountId ?? '')}` : t.splits.length > 1 ? `Split (${t.splits.length})` : catName.get(t.splits[0].categoryId ?? '') ?? 'Uncategorized'}
                  </td>
                  <td style={{ ...td, color: colors.text.tertiary, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.memo}</td>
                  <td style={num}><Money v={txnAmount(t)} cur={cur} sign /></td>
                  {accountId && <td style={{ ...num, color: colors.text.secondary }}>{formatMinor(bal, cur)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > 2000 && <div style={{ padding: 10, fontSize: 11, color: colors.text.tertiary }}>Showing the newest 2,000. Search or export CSV for the rest.</div>}
    </div>
  );
};

const TxnInspector: React.FC<{ doc: LedgerDoc; t: Transaction; onPatch: (p: Partial<Pick<Transaction, 'date' | 'payee' | 'memo' | 'splits' | 'status'>>) => void; onDelete: () => void; onClose: () => void }> = ({ doc, t, onPatch, onDelete, onClose }) => {
  const cur = doc.currency;
  const locked = t.status === 2;
  const xfer = isTransfer(t);
  const setSplit = (i: number, patch: Partial<Split>) => onPatch({ splits: t.splits.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, fontSize: 12, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ ...cap, flex: 1 }}>Transaction</span><button style={{ ...btn, height: 22 }} onClick={onClose}>Close</button></div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>Date
        <input type="date" style={inp} value={t.date} disabled={locked} onChange={(e) => e.target.value && onPatch({ date: e.target.value })} /></label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>Payee
        <input key={t.payee} style={inp} defaultValue={t.payee} disabled={xfer} onBlur={(e) => e.target.value !== t.payee && onPatch({ payee: e.target.value })} /></label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>Memo
        <input key={t.memo} style={inp} defaultValue={t.memo} onBlur={(e) => e.target.value !== t.memo && onPatch({ memo: e.target.value })} /></label>
      <div>
        <div style={{ ...cap, marginBottom: 4 }}>{xfer ? 'Amount' : 'Amounts'}</div>
        {t.splits.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            {!xfer && <select aria-label={`Category ${i + 1}`} style={{ ...inp, flex: 1 }} value={s.categoryId ?? ''} onChange={(e) => setSplit(i, { categoryId: e.target.value || null })}>
              <option value="">Uncategorized</option>
              {doc.categories.filter((c) => !c.archived || c.id === s.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>}
            {locked ? <span style={{ ...inp, display: 'flex', alignItems: 'center' }}>{formatMinor(s.amountMinor, cur)}</span>
              : <AmountCell ariaLabel={`Amount ${i + 1}`} value={s.amountMinor} cur={cur} onCommit={(v) => setSplit(i, { amountMinor: v })} />}
            {t.splits.length > 1 && !locked && <button style={{ ...btn, padding: '0 6px' }} aria-label={`Remove split ${i + 1}`} onClick={() => onPatch({ splits: t.splits.filter((_, j) => j !== i) })}>×</button>}
          </div>
        ))}
        {!xfer && !locked && <button style={{ ...btn, height: 22 }} onClick={() => onPatch({ splits: [...t.splits, { categoryId: null, amountMinor: 0, memo: '' }] })}>Add split</button>}
        <div style={{ marginTop: 6, color: colors.text.secondary }}>Total <Money v={txnAmount(t)} cur={cur} sign />{xfer && ' · the other account updates to match'}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1 }}>Status: {STATUS_LABEL[t.status]}</span>
        <button style={btn} onClick={() => onPatch({ status: (t.status === 0 ? 1 : 0) as TxnStatus })}>{t.status === 0 ? 'Mark cleared' : 'Mark uncleared'}</button>
      </div>
      {locked && <div style={{ color: colors.text.tertiary }}>Reconciled: amount and date are locked. Mark it uncleared to edit them.</div>}
      <button style={{ ...btn, color: colors.semantic.error, marginTop: 'auto' }} onClick={onDelete}>Delete{xfer ? ' transfer (both sides)' : ''}</button>
    </div>
  );
};

const Reconcile: React.FC<{ doc: LedgerDoc; accountId: string | null; setAccount: (id: string) => void; commit: Commit }> = ({ doc, accountId, setAccount, commit }) => {
  const cur = doc.currency;
  const open = doc.accounts.filter((a) => !a.closed);
  const id = accountId ?? open[0]?.id ?? null;
  const [stmt, setStmt] = useState('');
  const sv = parseAmount(stmt);
  if (!id) return null;
  const st = reconcileState(doc, id, sv ?? 0);
  const unclearedList = doc.transactions.filter((t) => t.accountId === id && t.status !== 2).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div>
      <Head title="Reconcile">
        <select aria-label="Account to reconcile" style={inp} value={id} onChange={(e) => setAccount(e.target.value)}>{open.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </Head>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '10px 14px', borderBottom: hair, fontSize: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Statement balance <input aria-label="Statement balance" inputMode="decimal" style={{ ...inp, width: 110, textAlign: 'right' }} value={stmt} onChange={(e) => setStmt(e.target.value)} placeholder="0.00" /></label>
        <span>Cleared balance <Money v={st.clearedMinor} cur={cur} /></span>
        {sv !== null && <span>Difference <span style={{ color: st.differenceMinor === 0 ? colors.accent.default : colors.semantic.warning }}>{formatMinor(st.differenceMinor, cur, { sign: true })}</span></span>}
        <button style={{ ...primary, marginLeft: 'auto' }} disabled={sv === null || st.differenceMinor !== 0 || st.pending === 0}
          onClick={() => commit((d) => finishReconcile(d, id, sv!), `Reconciled ${st.pending} transaction(s).`)}>Finish reconciling</button>
      </div>
      <div style={{ padding: '6px 14px', fontSize: 11, color: colors.text.tertiary }}>Tick each transaction that appears on your statement. When the difference is zero, finish to lock them.</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ ...th, width: 30 }} aria-label="On statement" /><th style={th}>Date</th><th style={th}>Payee</th><th style={{ ...th, textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>
          {unclearedList.map((t) => (
            <tr key={t.id}>
              <td style={td}><input type="checkbox" aria-label={`On statement: ${t.payee || t.date}`} checked={t.status === 1} onChange={() => commit((d) => updateTransaction(d, t.id, { status: (t.status === 1 ? 0 : 1) as TxnStatus }))} /></td>
              <td style={{ ...td, color: colors.text.secondary }}>{t.date}</td><td style={td}>{t.payee || '—'}</td><td style={num}><Money v={txnAmount(t)} cur={cur} sign /></td>
            </tr>
          ))}
          {!unclearedList.length && <tr><td colSpan={4} style={{ ...td, color: colors.text.tertiary }}>Everything in this account is reconciled.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

const Reports: React.FC<{ doc: LedgerDoc; month: string; setMonth: (fn: (m: string) => string) => void }> = ({ doc, month, setMonth }) => {
  const cur = doc.currency;
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const sums = months.map((m) => monthSummary(doc, m));
  const s = sums[sums.length - 1];
  const prev = sums[sums.length - 2];
  const spend = doc.categories.filter((c) => c.kind === 'expense').map((c) => ({ c, v: -(s.byCategory.get(c.id) ?? 0), p: -(prev.byCategory.get(c.id) ?? 0) })).filter((x) => x.v || x.p).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...spend.map((x) => Math.max(x.v, 0)));
  const maxBar = Math.max(1, ...sums.map((x) => Math.max(x.incomeMinor, x.expenseMinor)));
  const hasData = doc.transactions.some((t) => months.includes(monthOf(t.date)));
  return (
    <div>
      <Head title="Reports"><MonthNav month={month} setMonth={setMonth} /></Head>
      {!hasData ? <div style={{ padding: 20, fontSize: 12, color: colors.text.tertiary }}>No transactions in the six months up to {monthLabel(month)}.</div> : <>
        <div style={{ ...cap, padding: '12px 14px 6px' }}>Income vs spending, last 6 months (transfers excluded)</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', height: 120, padding: '0 14px' }} role="img" aria-label="Income and spending by month">
          {sums.map((x) => (
            <div key={x.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
              <div style={{ flex: 1, display: 'flex', gap: 3, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                <div title={`Income ${formatMinor(x.incomeMinor, cur)}`} style={{ width: '35%', maxWidth: 18, height: `${(Math.max(0, x.incomeMinor) / maxBar) * 100}%`, background: colors.accent.default, borderRadius: `${radius.xs}px ${radius.xs}px 0 0` }} />
                <div title={`Spending ${formatMinor(x.expenseMinor, cur)}`} style={{ width: '35%', maxWidth: 18, height: `${(Math.max(0, x.expenseMinor) / maxBar) * 100}%`, background: 'var(--color-text-tertiary)', borderRadius: `${radius.xs}px ${radius.xs}px 0 0` }} />
              </div>
              <span style={{ fontSize: 10, color: colors.text.tertiary }}>{new Date(`${x.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '4px 14px 0', fontSize: 11, color: colors.text.secondary }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: colors.accent.default, marginRight: 4 }} />Income</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--color-text-tertiary)', marginRight: 4 }} />Spending</span>
        </div>
        <div style={{ ...cap, padding: '16px 14px 4px' }}>Spending by category</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Category</th><th style={th} /><th style={{ ...th, textAlign: 'right' }}>{monthLabel(month)}</th><th style={{ ...th, textAlign: 'right' }}>Previous</th><th style={{ ...th, textAlign: 'right' }}>Change</th></tr></thead>
          <tbody>
            {spend.map(({ c, v, p }) => (
              <tr key={c.id}>
                <td style={td}>{c.name}</td>
                <td style={{ ...td, width: '30%' }}><div style={{ height: 6, borderRadius: radius.full, background: colors.accent.default, width: `${(Math.max(v, 0) / max) * 100}%` }} /></td>
                <td style={num}>{formatMinor(v, cur)}</td><td style={{ ...num, color: colors.text.secondary }}>{formatMinor(p, cur)}</td>
                <td style={{ ...num, color: v > p ? colors.semantic.warning : colors.text.secondary }}>{formatMinor(v - p, cur, { sign: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>}
    </div>
  );
};

const Categories: React.FC<{ doc: LedgerDoc; commit: Commit }> = ({ doc, commit }) => {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [kind, setKind] = useState<Category['kind']>('expense');
  const used = useMemo(() => new Set(doc.transactions.flatMap((t) => t.splits.map((s) => s.categoryId))), [doc.transactions]);
  const groups = [...new Set(doc.categories.map((c) => c.group))];
  return (
    <div>
      <Head title="Categories" />
      <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; commit((d) => ({ ...d, categories: [...d.categories, { id: newId('c'), name: name.trim(), group: group.trim(), kind, archived: false }] })); setName(''); }}
        style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: hair }} aria-label="New category">
        <input aria-label="Category name" placeholder="New category" style={{ ...inp, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Group" placeholder="Group" list="ledger-groups" style={{ ...inp, width: 140 }} value={group} onChange={(e) => setGroup(e.target.value)} />
        <datalist id="ledger-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        <select aria-label="Kind" style={inp} value={kind} onChange={(e) => setKind(e.target.value as Category['kind'])}><option value="expense">Expense</option><option value="income">Income</option></select>
        <button type="submit" style={primary} disabled={!name.trim()}>Add</button>
      </form>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Name</th><th style={th}>Group</th><th style={th}>Kind</th><th style={th} /></tr></thead>
        <tbody>
          {doc.categories.map((c) => (
            <tr key={c.id} style={{ opacity: c.archived ? 0.5 : 1 }}>
              <td style={td}><input key={c.name} aria-label="Category name" defaultValue={c.name} style={{ ...inp, background: 'transparent', border: '1px solid transparent' }}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && commit((d) => ({ ...d, categories: d.categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value.trim() } : x)) }))} /></td>
              <td style={{ ...td, color: colors.text.secondary }}>{c.group}</td>
              <td style={{ ...td, color: colors.text.secondary }}>{c.kind === 'income' ? 'Income' : 'Expense'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button style={{ ...btn, height: 22 }} onClick={() => commit((d) => ({ ...d, categories: d.categories.map((x) => (x.id === c.id ? { ...x, archived: !x.archived } : x)) }))}>{c.archived ? 'Restore' : 'Archive'}</button>
                {!used.has(c.id) && <button style={{ ...btn, height: 22, marginLeft: 4 }} onClick={() => commit((d) => deleteCategory(d, c.id))}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Ledger;
