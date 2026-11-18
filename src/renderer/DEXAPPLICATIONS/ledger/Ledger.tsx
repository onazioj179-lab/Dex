// =============================================================================
// DEX Platform — DEX Ledger
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Local-first personal finance: accounts, transactions, an envelope budget,
// reconciliation and reports over one native SQLite ledger (core/dex-ledger).
// Layout: sidebar (sections + accounts) | workspace | collapsible inspector.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/appShell';
import type { MenuGroup } from '../../components/appShell/menuTypes';
import { useConfirm } from '../../components/ConfirmDialog';
import { registerAppIntentHandler } from '../../services/appIntents';
import { registerLedgerUkiActions } from './ledgerUki';
import { ledger, ledgerAvailable, LedgerUnavailableError, LedgerError, type LedgerStatus } from './ledgerApi';
import { formatMoney, todayLocal } from './money';
import { LedgerContext, LEDGER_CSS, useLedgerQuery, errText, Empty, Btn, type EditorRequest, type LedgerCtx, type Section } from './ledgerUi';
import { LedgerSidebar } from './LedgerSidebar';
import { SetupView } from './views/SetupView';
import { OverviewView } from './views/OverviewView';
import { BudgetView } from './views/BudgetView';
import { TransactionsView } from './views/TransactionsView';
import { AccountsView } from './views/AccountsView';
import { ReconcileView } from './views/ReconcileView';
import { ReportsView } from './views/ReportsView';
import { CategoriesView } from './views/CategoriesView';
import { DataView } from './views/DataView';
import { TransactionEditor } from './TransactionEditor';
import { ImportDialog } from './ImportDialog';
import { AccountDialog } from './AccountDialog';

const UI_KEY = 'dex-ledger-ui';
interface UiPrefs { section: Section; sidebarCollapsed: boolean }

function loadPrefs(): UiPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    return { section: p.section || 'overview', sidebarCollapsed: !!p.sidebarCollapsed };
  } catch { return { section: 'overview', sidebarCollapsed: false }; }
}

const SECTION_TITLES: Record<Section, string> = {
  overview: 'Overview', budget: 'Budget', transactions: 'Transactions', accounts: 'Accounts',
  reconcile: 'Reconcile', reports: 'Reports', categories: 'Categories', data: 'Backups & history',
};

function toast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* non-DOM */ }
}

export const Ledger: React.FC = () => {
  const statusQ = useLedgerQuery<LedgerStatus>(() => ledger.status(), []);
  const { confirm, ConfirmHost } = useConfirm();

  if (!ledgerAvailable()) {
    return (
      <Frame>
        <Empty icon="lock" title="DEX Ledger runs in the DEX desktop app">
          Your ledger is a local database on this computer that only the DEX app can open. It isn't available in a browser preview, and DEX never shows sample figures in its place.
        </Empty>
      </Frame>
    );
  }
  if (statusQ.loading && !statusQ.data) return <Frame><div className="lg-pad lg-muted">Opening your ledger…</div></Frame>;
  if (statusQ.error || !statusQ.data) {
    return <Frame><RecoveryView message={statusQ.error || 'The ledger could not be opened.'} onDone={statusQ.reload} confirm={confirm} /><ConfirmHost /></Frame>;
  }
  if (!statusQ.data.ready) return <Frame><SetupView onDone={statusQ.reload} /></Frame>;
  return <LedgerApp status={statusQ.data} confirm={confirm} ConfirmHost={ConfirmHost} />;
};

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AppShell appId="ledger" title="Ledger">
    <style>{LEDGER_CSS}</style>
    <div className="dex-ledger" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>{children}</div>
  </AppShell>
);

const RecoveryView: React.FC<{ message: string; onDone: () => void; confirm: LedgerCtx['confirm'] }> = ({ message, onDone, confirm }) => {
  const corrupt = message.startsWith('CORRUPT');
  const [busy, setBusy] = useState(false);
  const run = async (action: 'restoreLatest' | 'startFresh') => {
    const ok = await confirm({
      title: action === 'restoreLatest' ? 'Restore the newest backup?' : 'Start an empty ledger?',
      message: 'The damaged ledger file is kept next to the new one (renamed), so nothing is deleted.',
      confirmLabel: action === 'restoreLatest' ? 'Restore backup' : 'Start empty',
      tone: action === 'startFresh' ? 'destructive' : 'neutral',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await ledger.recover(action);
      toast(r.restoredFrom ? `Restored ${r.restoredFrom}` : 'Started an empty ledger', 'success');
      onDone();
    } catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="lg-pad" style={{ maxWidth: 560 }}>
      <div className="lg-banner lg-error" role="alert">{corrupt ? 'The ledger database failed its integrity check, so DEX did not open it.' : message}</div>
      {corrupt && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Btn variant="primary" disabled={busy} onClick={() => run('restoreLatest')}>Restore newest backup</Btn>
          <Btn disabled={busy} onClick={() => run('startFresh')}>Start empty</Btn>
        </div>
      )}
      {!corrupt && <Btn style={{ marginTop: 12 }} onClick={onDone}>Try again</Btn>}
    </div>
  );
};

const LedgerApp: React.FC<{ status: LedgerStatus; confirm: LedgerCtx['confirm']; ConfirmHost: React.FC }> = ({ status, confirm, ConfirmHost }) => {
  const [prefs, setPrefs] = useState<UiPrefs>(loadPrefs);
  const [accountFilter, setAccountFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [importFor, setImportFor] = useState<number | null | undefined>(undefined);
  const [newAccount, setNewAccount] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Compact windows collapse the sidebar automatically; the toggle then opens
  // it as an overlay for this session without changing the saved preference.
  const [narrow, setNarrow] = useState(false);
  const [narrowOpen, setNarrowOpen] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sidebarCollapsed = narrow ? !narrowOpen : prefs.sidebarCollapsed;
  const toggleSidebar = useCallback(() => {
    if (narrow) setNarrowOpen(o => !o);
    else setPrefs(p => ({ ...p, sidebarCollapsed: !p.sidebarCollapsed }));
  }, [narrow]);
  const accountsQ = useLedgerQuery(() => ledger.accounts(), []);
  const groupsQ = useLedgerQuery(() => ledger.categories(), []);
  const statusQ = useLedgerQuery(() => ledger.status(), []);
  const live = statusQ.data || status;
  const currency = live.currency || 'USD';
  const digits = live.digits;

  // UKI can read a summary (asks first: financial data) and add a line (asks first).
  useEffect(() => registerLedgerUkiActions(currency, digits), [currency, digits]);

  useEffect(() => { try { localStorage.setItem(UI_KEY, JSON.stringify(prefs)); } catch { /* quota */ } }, [prefs]);

  const go = useCallback<LedgerCtx['go']>((s, params) => {
    setPrefs(p => ({ ...p, section: s }));
    setNarrowOpen(false);
    if (params && 'accountId' in params) setAccountFilter(params.accountId ?? null);
    else if (s !== 'transactions' && s !== 'reconcile') setAccountFilter(null);
    if (params && 'categoryId' in params) setCategoryFilter(params.categoryId ?? null);
    else setCategoryFilter(null);
  }, []);

  const openEditor = useCallback((r: EditorRequest) => setEditor(r), []);
  const closeEditor = useCallback(() => setEditor(null), []);
  const openImport = useCallback((accountId?: number) => setImportFor(accountId ?? null), []);

  const ctx: LedgerCtx = useMemo(() => ({
    status: live,
    currency,
    digits,
    accounts: accountsQ.data || [],
    groups: groupsQ.data || [],
    fmt: (minor, opts) => formatMoney(minor, currency, digits, opts),
    section: prefs.section,
    go,
    accountFilter,
    categoryFilter,
    openEditor,
    closeEditor,
    toast,
    confirm,
    openImport,
    today: todayLocal(),
  }), [live, currency, digits, accountsQ.data, groupsQ.data, prefs.section, go, accountFilter, categoryFilter, openEditor, closeEditor, confirm, openImport]);

  const runBackup = useCallback(async () => {
    try { const b = await ledger.backup(); toast(`Backup saved (${b.file})`, 'success'); } catch (e) { toast(errText(e), 'error'); }
  }, []);
  const exportCsv = useCallback(async () => {
    try {
      const r = await ledger.csvExport(accountFilter ? { accountId: accountFilter } : {});
      const s = await ledger.saveText(`ledger-transactions-${todayLocal()}.csv`, r.csv);
      if (!s.canceled) toast(`Exported ${r.count} transactions`, 'success');
    } catch (e) { toast(errText(e), 'error'); }
  }, [accountFilter]);

  // Quick actions from the App Menu / search / context menus (registered capabilities).
  useEffect(() => {
    return registerAppIntentHandler('ledger', (action) => {
      switch (action) {
        case 'new-transaction': go('transactions'); setEditor({ mode: 'new', kind: 'expense' }); return true;
        case 'open-budget': go('budget'); return true;
        case 'import-csv': setImportFor(null); return true;
        case 'open-reports': go('reports'); return true;
        case 'open-settings': go('data'); return true;
        default: return false;
      }
    });
  }, [go]);

  const sectionKeys: Section[] = ['overview', 'budget', 'transactions', 'accounts', 'reconcile', 'reports', 'categories'];
  const menus: MenuGroup[] = [
    { id: 'file', label: 'File', sections: [
      { id: 'new', items: [
        { id: 'new-txn', label: 'New transaction', shortcut: 'Ctrl+N', icon: 'plus', run: () => setEditor({ mode: 'new', kind: 'expense' }) },
        { id: 'new-income', label: 'New income', run: () => setEditor({ mode: 'new', kind: 'income' }) },
        { id: 'new-transfer', label: 'New transfer', icon: 'shuffle', run: () => setEditor({ mode: 'new', kind: 'transfer' }) },
        { id: 'new-account', label: 'New account…', run: () => setNewAccount(true) },
      ] },
      { id: 'io', label: 'Import & export', items: [
        { id: 'import', label: 'Import CSV…', icon: 'import', run: () => setImportFor(accountFilter) },
        { id: 'export', label: accountFilter ? 'Export this account as CSV…' : 'Export all transactions as CSV…', icon: 'export', run: exportCsv },
      ] },
      { id: 'backup', label: 'Backup', items: [
        { id: 'backup-now', label: 'Back up now', icon: 'shield', run: runBackup },
        { id: 'backup-export', label: 'Export backup file…', run: async () => { try { const r = await ledger.exportBackup(); if (!r.canceled) toast('Backup file saved', 'success'); } catch (e) { toast(errText(e), 'error'); } } },
        { id: 'backups', label: 'Backups & history…', run: () => go('data') },
      ] },
    ] },
    { id: 'view', label: 'View', sections: [
      { id: 'sections', items: sectionKeys.map(s => ({ id: `go-${s}`, label: SECTION_TITLES[s], checked: prefs.section === s, run: () => go(s) })) },
      { id: 'layout', items: [
        { id: 'sidebar', label: sidebarCollapsed ? 'Show sidebar' : 'Collapse sidebar', icon: 'sidebar', run: toggleSidebar },
        { id: 'print', label: 'Print this view…', icon: 'printer', run: () => window.print() },
      ] },
    ] },
  ];

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n' && !typing) {
      e.preventDefault(); e.stopPropagation();
      setEditor({ mode: 'new', kind: 'expense', accountId: accountFilter ?? undefined });
    }
  };

  const view = (() => {
    switch (prefs.section) {
      case 'budget': return <BudgetView />;
      case 'transactions': return <TransactionsView selectedId={editor?.mode === 'edit' ? editor.id ?? null : null} />;
      case 'accounts': return <AccountsView onNewAccount={() => setNewAccount(true)} />;
      case 'reconcile': return <ReconcileView />;
      case 'reports': return <ReportsView />;
      case 'categories': return <CategoriesView />;
      case 'data': return <DataView />;
      default: return <OverviewView />;
    }
  })();

  const loadError = accountsQ.error || groupsQ.error;

  return (
    <LedgerContext.Provider value={ctx}>
      <AppShell
        appId="ledger"
        menus={menus}
        title={`Ledger · ${currency}`}
        toolbarEnd={<Btn small variant="primary" icon="plus" onClick={() => setEditor({ mode: 'new', kind: 'expense', accountId: accountFilter ?? undefined })}>Transaction</Btn>}
      >
        <style>{LEDGER_CSS}</style>
        <div ref={rootRef} className="dex-ledger" onKeyDown={onKeyDown} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          <div className="lg-layout">
            <LedgerSidebar
              collapsed={sidebarCollapsed}
              onToggle={toggleSidebar}
              onNewAccount={() => setNewAccount(true)}
            />
            <main className="lg-main" aria-label={SECTION_TITLES[prefs.section]}>
              {loadError ? <div className="lg-pad"><div className="lg-banner lg-error" role="alert">{loadError}</div></div> : view}
            </main>
            {editor && (
              <aside className="lg-inspector" aria-label="Transaction details">
                <TransactionEditor key={`${editor.mode}-${editor.id ?? ''}-${editor.kind ?? ''}`} request={editor} onClose={() => setEditor(null)} onSaved={(id) => setEditor({ mode: 'edit', id })} />
              </aside>
            )}
          </div>
          {importFor !== undefined && <ImportDialog initialAccountId={importFor} onClose={() => setImportFor(undefined)} />}
          {newAccount && <AccountDialog onClose={() => setNewAccount(false)} />}
          <ConfirmHost />
        </div>
      </AppShell>
    </LedgerContext.Provider>
  );
};

export { LedgerUnavailableError, LedgerError };
export default Ledger;
