// =============================================================================
// DEX Platform — DEX Ledger overview
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import React, { useState } from 'react';
import { ledger, ACCOUNT_KIND_LABEL, type AccountKind, type Overview } from '../ledgerApi';
import { formatDate, monthEnd, monthOf, shiftMonth, formatMonth } from '../money';
import { useLedger, useLedgerQuery, Money, Btn, Empty, errText, StatusDot } from '../ledgerUi';

type Period = 'month' | 'last' | 'quarter' | 'year';

function periodRange(p: Period, today: string): { from: string; to: string; label: string } {
  const m = monthOf(today);
  switch (p) {
    case 'last': { const lm = shiftMonth(m, -1); return { from: `${lm}-01`, to: monthEnd(lm), label: formatMonth(lm) }; }
    case 'quarter': { const s = shiftMonth(m, -2); return { from: `${s}-01`, to: today, label: 'Last 3 months' }; }
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today, label: `${today.slice(0, 4)} to date` };
    default: return { from: `${m}-01`, to: monthEnd(m), label: formatMonth(m) };
  }
}

export const OverviewView: React.FC = () => {
  const { today, go, openEditor, accounts, toast } = useLedger();
  const [period, setPeriod] = useState<Period>('month');
  const r = periodRange(period, today);
  const q = useLedgerQuery<Overview>(() => ledger.overview(r.from, r.to, today), [r.from, r.to, today]);
  const o = q.data;

  const post = async (id: number) => {
    try { await ledger.postRecurring(id); toast('Scheduled transaction entered', 'success'); } catch (e) { toast(errText(e), 'error'); }
  };
  const skip = async (id: number) => {
    try { await ledger.skipRecurring(id); toast('Skipped to the next date', 'info'); } catch (e) { toast(errText(e), 'error'); }
  };

  return (
    <>
      <div className="lg-toolbar">
        <h1>Overview</h1>
        <span className="lg-sub">{r.label}</span>
        <span className="lg-spacer" />
        <div className="lg-segment" role="group" aria-label="Period">
          {(['month', 'last', 'quarter', 'year'] as Period[]).map(p => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {p === 'month' ? 'This month' : p === 'last' ? 'Last month' : p === 'quarter' ? '3 months' : 'Year'}
            </button>
          ))}
        </div>
      </div>
      <div className="lg-scroll">
        <div className="lg-pad">
          {q.error && <div className="lg-banner lg-error" role="alert">{q.error}</div>}
          {accounts.length === 0 && !q.loading && (
            <Empty icon="landmark" title="Add your first account">
              Accounts hold your money: a bank account, cash, savings or a credit card. Enter each one's current balance as its opening balance, then record transactions or import them from CSV.
              <div style={{ marginTop: 10 }}><Btn variant="primary" onClick={() => go('accounts')}>Go to Accounts</Btn></div>
            </Empty>
          )}
          {o && accounts.length > 0 && (
            <>
              <div className="lg-summary" aria-label="Summary">
                <div>
                  <div className="lg-summary-label">Total balance</div>
                  <div className="lg-summary-value"><Money minor={o.totalBalance} /></div>
                </div>
                <div>
                  <div className="lg-summary-label">Income</div>
                  <div className="lg-summary-value"><Money minor={o.income} /></div>
                </div>
                <div>
                  <div className="lg-summary-label">Expenses</div>
                  <div className="lg-summary-value"><Money minor={o.expenses} /></div>
                </div>
                <div>
                  <div className="lg-summary-label">Net cash flow</div>
                  <div className="lg-summary-value" style={{ color: o.net < 0 ? 'var(--color-error)' : undefined }}><Money minor={o.net} sign /></div>
                </div>
              </div>
              <div className="lg-muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Income and expenses count categorised money only; transfers between your accounts are excluded.
                {o.uncategorized !== 0 && <> Uncategorised: <Money minor={o.uncategorized} sign /> (included in net).</>}
              </div>

              {(o.uncategorizedCount > 0) && (
                <div className="lg-banner" style={{ marginTop: 12 }}>
                  <span style={{ flex: 1 }}>{o.uncategorizedCount} transaction{o.uncategorizedCount === 1 ? ' has' : 's have'} no category, so the budget can't account for {o.uncategorizedCount === 1 ? 'it' : 'them'}.</span>
                  <Btn small onClick={() => go('transactions', { categoryId: -1 })}>Review</Btn>
                </div>
              )}

              <div className="lg-section-title">Balances by type</div>
              <div className="lg-panel">
                <table className="lg-table">
                  <tbody>
                    {(Object.keys(o.balanceByKind) as AccountKind[]).map(k => (
                      <tr key={k}><td>{ACCOUNT_KIND_LABEL[k]}</td><td className="lg-r"><Money minor={o.balanceByKind[k] || 0} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg-section-title">
                Recent transactions
                <span className="lg-spacer" />
                <Btn small variant="ghost" onClick={() => go('transactions')}>View all</Btn>
              </div>
              <div className="lg-panel lg-hscroll">
                {o.recent.length === 0 ? <Empty title="No transactions yet" /> : (
                  <table className="lg-table">
                    <tbody>
                      {o.recent.map(t => (
                        <tr key={t.id} tabIndex={0} onClick={() => { go('transactions'); openEditor({ mode: 'edit', id: t.id }); }} onKeyDown={e => { if (e.key === 'Enter') { go('transactions'); openEditor({ mode: 'edit', id: t.id }); } }}>
                          <td className="lg-muted" style={{ width: 96 }}>{formatDate(t.date)}</td>
                          <td>{t.isTransfer ? `Transfer ${t.amount < 0 ? 'to' : 'from'} ${t.transferAccountName}` : t.payee || <span className="lg-muted">No payee</span>}</td>
                          <td className="lg-muted lg-hide-sm">{t.accountName}</td>
                          <td className="lg-hide-xs" style={{ width: 22 }}><StatusDot status={t.status} /></td>
                          <td className="lg-r"><Money minor={t.amount} tone="auto" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="lg-section-title">Upcoming (next 30 days)</div>
              <div className="lg-panel lg-hscroll">
                {o.upcoming.length === 0 ? (
                  <Empty icon="calendar" title="Nothing scheduled">Add recurring bills or income from the Accounts page. DEX lists them here and enters them only when you choose to.</Empty>
                ) : (
                  <table className="lg-table">
                    <tbody>
                      {o.upcoming.map(u => (
                        <tr key={u.id}>
                          <td className="lg-muted" style={{ width: 96 }}>{formatDate(u.nextDate)}</td>
                          <td>{u.transferAccountId ? `Transfer to ${u.transferAccountName}` : u.payee || <span className="lg-muted">No payee</span>}<span className="lg-muted"> · {u.frequency}</span></td>
                          <td className="lg-muted lg-hide-sm">{u.accountName}</td>
                          <td className="lg-r"><Money minor={u.transferAccountId ? -u.amount : u.amount} tone="auto" /></td>
                          <td className="lg-r" style={{ width: 150 }}>
                            <Btn small onClick={() => post(u.id)}>Enter</Btn>{' '}
                            <Btn small variant="ghost" onClick={() => skip(u.id)}>Skip</Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};
