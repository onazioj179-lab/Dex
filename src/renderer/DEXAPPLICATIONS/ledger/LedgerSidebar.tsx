// =============================================================================
// DEX Platform — DEX Ledger sidebar
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import React, { useState } from 'react';
import DexIcon from '../../components/DexIcon';
import { ACCOUNT_KIND_LABEL, ACCOUNT_KINDS, type AccountKind } from './ledgerApi';
import { useLedger, IconBtn, type Section } from './ledgerUi';

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'budget', label: 'Budget', icon: 'pie-chart' },
  { id: 'transactions', label: 'Transactions', icon: 'list' },
  { id: 'accounts', label: 'Accounts', icon: 'landmark' },
  { id: 'reconcile', label: 'Reconcile', icon: 'check-square' },
  { id: 'reports', label: 'Reports', icon: 'bar-chart-2' },
  { id: 'categories', label: 'Categories', icon: 'tags' },
];

const COLLAPSE_KEY = 'dex-ledger-side-groups';

export const LedgerSidebar: React.FC<{ collapsed: boolean; onToggle: () => void; onNewAccount: () => void }> = ({ collapsed, onToggle, onNewAccount }) => {
  const { section, go, accounts, accountFilter, fmt } = useLedger();
  const [closed, setClosed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch { return new Set(); }
  });
  const toggleGroup = (k: string) => setClosed(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...n])); } catch { /* quota */ }
    return n;
  });
  const active = accounts.filter(a => !a.archived);
  const total = active.reduce((s, a) => s + a.balance, 0);

  // Roving arrow-key navigation over every row button in the sidebar.
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-lg-nav]'));
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : e.key === 'ArrowDown' ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0);
    rows[next]?.focus();
  };

  return (
    <nav className={`lg-side ${collapsed ? 'lg-collapsed' : ''}`} aria-label="Ledger" onKeyDown={onKeyDown}>
      <div className="lg-side-scroll">
        {NAV.map(n => (
          <button
            key={n.id}
            type="button"
            data-lg-nav=""
            className={`lg-nav-row ${section === n.id && !(n.id === 'transactions' && accountFilter) ? 'lg-active' : ''}`}
            aria-current={section === n.id ? 'page' : undefined}
            title={collapsed ? n.label : undefined}
            onClick={() => go(n.id, { accountId: null })}
          >
            <span className="lg-nav-icon"><DexIcon name={n.icon} size={15} color="currentColor" /></span>
            <span className="lg-nav-label">{n.label}</span>
          </button>
        ))}

        <div className="lg-side-head">
          <span>Accounts</span>
          <span className="lg-num" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{fmt(total)}</span>
        </div>
        <div className="lg-side-accounts">
          {active.length === 0 && (
            <div className="lg-muted" style={{ padding: '4px 8px 8px', fontSize: 12 }}>No accounts yet.</div>
          )}
          {ACCOUNT_KINDS.map((k: AccountKind) => {
            const list = active.filter(a => a.kind === k);
            if (!list.length) return null;
            const sum = list.reduce((s, a) => s + a.balance, 0);
            const isClosed = closed.has(k);
            return (
              <div key={k} className="lg-side-group">
                <button type="button" data-lg-nav="" className="lg-side-group-btn" aria-expanded={!isClosed} onClick={() => toggleGroup(k)}>
                  <DexIcon name={isClosed ? 'chevron-right' : 'chevron-down'} size={11} color="currentColor" />
                  <span>{ACCOUNT_KIND_LABEL[k]}</span>
                  <span className="lg-nav-meta">{fmt(sum)}</span>
                </button>
                {!isClosed && list.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    data-lg-nav=""
                    className={`lg-nav-row ${section === 'transactions' && accountFilter === a.id ? 'lg-active' : ''}`}
                    style={{ paddingLeft: 24 }}
                    title={`${a.name} — ${fmt(a.balance)}`}
                    onClick={() => go('transactions', { accountId: a.id })}
                  >
                    <span className="lg-nav-label">{a.name}</span>
                    <span className={`lg-nav-meta ${a.balance < 0 ? 'lg-neg' : ''}`} style={a.balance < 0 ? { color: 'var(--color-error)' } : undefined}>{fmt(a.balance)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="lg-side-foot">
        <button type="button" data-lg-nav="" className="lg-nav-row" onClick={onNewAccount} title={collapsed ? 'Add account' : undefined}>
          <span className="lg-nav-icon"><DexIcon name="plus" size={15} color="currentColor" /></span>
          <span className="lg-nav-label">Add account</span>
        </button>
        <div style={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
          <IconBtn icon={collapsed ? 'chevrons-right' : 'chevrons-left'} label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle} />
        </div>
      </div>
    </nav>
  );
};
