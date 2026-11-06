// =============================================================================
// DEX Platform — DEX Ledger reconciliation
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// 1) Enter the statement's date and ending balance. 2) Tick what appears on the
// statement (or import the statement CSV to propose matches). 3) When the
// difference is zero, finish: cleared rows become reconciled and locked.
// Nothing is changed without the user pressing a button.

import React, { useEffect, useMemo, useState } from 'react';
import { ledger, type ReconcileSummary, type MatchResult, type Reconciliation } from '../ledgerApi';
import { formatDate, localeDateOrder, todayLocal } from '../money';
import { useLedger, useLedgerQuery, Money, MoneyInput, Btn, Empty, Field, StatusDot, errText } from '../ledgerUi';

export const ReconcileView: React.FC = () => {
  const { accounts, accountFilter, go, digits, toast, confirm, fmt } = useLedger();
  const active = accounts.filter(a => !a.archived);
  const accountId = accountFilter ?? active[0]?.id ?? null;
  const account = accounts.find(a => a.id === accountId);
  const [statementDate, setStatementDate] = useState(todayLocal());
  const [statementBalance, setStatementBalance] = useState<number | null>(null);
  const [negative, setNegative] = useState(false);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matchFile, setMatchFile] = useState<{ name: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sumQ = useLedgerQuery<ReconcileSummary | null>(() => accountId ? ledger.reconcileSummary(accountId) : Promise.resolve(null), [accountId]);
  const histQ = useLedgerQuery<Reconciliation[]>(() => accountId ? ledger.reconcileHistory(accountId) : Promise.resolve([]), [accountId]);
  const s = sumQ.data;

  useEffect(() => { setMatch(null); setMatchFile(null); setStatementBalance(null); }, [accountId]);
  useEffect(() => { if (account?.kind === 'credit') setNegative(true); else setNegative(false); }, [account?.kind]);

  const statement = statementBalance === null ? null : statementBalance * (negative ? -1 : 1);
  const diff = statement === null || !s ? null : statement - s.clearedBalance;

  const rematch = async (file = matchFile) => {
    if (!file || !accountId) return;
    try { setMatch(await ledger.reconcileMatch({ accountId, content: file.content, dateOrder: localeDateOrder() })); } catch (e) { toast(errText(e), 'error'); }
  };
  // Keep proposed matches current as statuses change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (matchFile) rematch(); }, [s]);

  const importStatement = async () => {
    try {
      const f = await ledger.openCsv();
      if (f.canceled || !f.content) return;
      const file = { name: f.name || 'statement.csv', content: f.content };
      setMatchFile(file);
      await rematch(file);
    } catch (e) { toast(errText(e), 'error'); }
  };

  const toggle = async (id: number, cleared: boolean) => {
    try { await ledger.setStatus([id], cleared ? 'uncleared' : 'cleared'); } catch (e) { toast(errText(e), 'error'); }
  };

  const matchedUncleared = useMemo(() => (match?.lines || []).filter(l => l.matchId && l.matchStatus === 'uncleared').map(l => l.matchId!) , [match]);

  const clearMatched = async () => {
    if (!matchedUncleared.length) return;
    try { await ledger.setStatus(matchedUncleared, 'cleared'); toast(`Marked ${matchedUncleared.length} matched transaction${matchedUncleared.length === 1 ? '' : 's'} cleared`, 'success'); } catch (e) { toast(errText(e), 'error'); }
  };

  const addLine = async (l: MatchResult['lines'][number]) => {
    if (!accountId || !l.date || !l.amount) return;
    const ok = await confirm({ title: 'Add this statement line to the ledger?', message: `${formatDate(l.date)} · ${l.payee || 'No description'} · ${fmt(l.amount)}. It is added as cleared and uncategorised.`, confirmLabel: 'Add' });
    if (!ok) return;
    try { await ledger.createTxn({ accountId, date: l.date, payee: l.payee, memo: l.memo, amount: l.amount, status: 'cleared' }); } catch (e) { toast(errText(e), 'error'); }
  };

  const finish = async (adjust: boolean) => {
    if (!accountId || statement === null || diff === null) return;
    if (adjust) {
      const ok = await confirm({ title: `Record an adjustment of ${fmt(diff, { sign: true })}?`, message: 'DEX adds a cleared "Reconciliation adjustment" transaction so the account matches the statement. Usually a missing or mistyped transaction is the real cause; check first.', confirmLabel: 'Add adjustment and finish', tone: 'destructive' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await ledger.reconcileFinish({ accountId, statementDate, statementBalance: statement, createAdjustment: adjust });
      toast(`Reconciled ${r.transactions} transaction${r.transactions === 1 ? '' : 's'}`, 'success');
      setStatementBalance(null); setMatch(null); setMatchFile(null);
    } catch (e) { toast(errText(e).replace(/^DIFFERENCE:.*/, 'The cleared balance does not match the statement yet'), 'error'); } finally { setBusy(false); }
  };

  const undo = async (r: Reconciliation) => {
    if (!(await confirm({ title: 'Undo this reconciliation?', message: `${r.transactions} transaction${r.transactions === 1 ? '' : 's'} go back to cleared. ${r.adjustmentId ? 'The adjustment transaction stays; delete it yourself if it was wrong.' : ''}`, confirmLabel: 'Undo' }))) return;
    try { await ledger.reconcileUndo(r.id); toast('Reconciliation undone', 'success'); } catch (e) { toast(errText(e), 'error'); }
  };

  if (!active.length) return <><div className="lg-toolbar"><h1>Reconcile</h1></div><Empty icon="check-square" title="No accounts to reconcile" /></>;

  return (
    <>
      <div className="lg-toolbar">
        <h1>Reconcile</h1>
        <select className="lg-input" aria-label="Account" style={{ width: 200 }} value={accountId ?? ''} onChange={e => go('reconcile', { accountId: Number(e.target.value) })}>
          {active.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span className="lg-spacer" />
        <Btn small icon="import" onClick={importStatement}>{matchFile ? 'Replace statement CSV' : 'Import statement CSV…'}</Btn>
      </div>
      <div className="lg-scroll">
        <div className="lg-pad">
          {s && (
            <>
              <div className="lg-summary">
                <div><div className="lg-summary-label">Cleared balance</div><div className="lg-summary-value"><Money minor={s.clearedBalance} /></div></div>
                <div><div className="lg-summary-label">Statement balance</div><div className="lg-summary-value">{statement === null ? <span className="lg-muted">—</span> : <Money minor={statement} />}</div></div>
                <div><div className="lg-summary-label">Difference</div><div className="lg-summary-value" style={{ color: diff ? 'var(--color-error)' : undefined }}>{diff === null ? <span className="lg-muted">—</span> : <Money minor={diff} sign />}</div></div>
                <div><div className="lg-summary-label">Last reconciled</div><div className="lg-summary-value" style={{ fontSize: 14 }}>{s.last ? `${formatDate(s.last.statementDate)}` : 'Never'}</div></div>
              </div>

              <div className="lg-section-title">Statement</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Statement date"><input className="lg-input" type="date" value={statementDate} onChange={e => setStatementDate(e.target.value)} style={{ width: 160 }} aria-label="Statement date" /></Field>
                <Field label="Ending balance on the statement"><div style={{ width: 170 }}><MoneyInput value={statementBalance} digits={digits} onChange={setStatementBalance} ariaLabel="Statement ending balance" /></div></Field>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, paddingBottom: 6 }}>
                  <input type="checkbox" checked={negative} onChange={e => setNegative(e.target.checked)} /> Balance is owed (negative)
                </label>
                <span className="lg-spacer" />
                <Btn variant="primary" disabled={busy || diff !== 0} onClick={() => finish(false)}>Finish reconciliation</Btn>
                {diff !== null && diff !== 0 && <Btn disabled={busy} onClick={() => finish(true)}>Finish with adjustment…</Btn>}
              </div>
              {diff !== null && diff !== 0 && <div className="lg-banner lg-warn" style={{ marginTop: 8 }}>Tick the transactions that appear on the statement until the difference is zero. Off by {fmt(Math.abs(diff))}.</div>}

              {match && (
                <>
                  <div className="lg-section-title">
                    Statement lines · {matchFile?.name}
                    <span className="lg-spacer" />
                    <Btn small disabled={!matchedUncleared.length} onClick={clearMatched}>Mark {matchedUncleared.length} matched as cleared</Btn>
                  </div>
                  {match.dateAmbiguous && <div className="lg-banner" style={{ marginBottom: 8 }}>Dates in this file could be day-first or month-first; DEX read them as {match.dateFormat === 'dmy' ? 'day/month/year' : 'month/day/year'} from your region settings.</div>}
                  <div className="lg-panel lg-hscroll">
                    <table className="lg-table" aria-label="Statement lines">
                      <thead><tr><th>Date</th><th>Description</th><th className="lg-r">Amount</th><th>Match in ledger</th></tr></thead>
                      <tbody>
                        {match.lines.map(l => (
                          <tr key={l.line}>
                            <td className="lg-muted">{l.date ? formatDate(l.date) : '—'}</td>
                            <td>{l.payee || <span className="lg-muted">—</span>}</td>
                            <td className="lg-r">{l.amount !== null ? <Money minor={l.amount} tone="auto" /> : '—'}</td>
                            <td>
                              {l.error ? <span style={{ color: 'var(--color-error)' }}>Line {l.line}: {l.error}</span>
                                : l.matchId ? <span>{l.matchPayee || 'Transaction'} <span className="lg-muted">· {l.matchStatus}</span></span>
                                : <Btn small onClick={() => addLine(l)}>Not in ledger — add…</Btn>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {match.unmatchedTransactions.length > 0 && <div className="lg-muted" style={{ fontSize: 12, marginTop: 6 }}>{match.unmatchedTransactions.length} ledger transaction{match.unmatchedTransactions.length === 1 ? ' is' : 's are'} not on this statement (marked below).</div>}
                </>
              )}

              <div className="lg-section-title">Not yet reconciled ({s.open.length})</div>
              <div className="lg-panel lg-hscroll">
                {s.open.length === 0 ? <Empty icon="check-circle" title="Everything is reconciled" /> : (
                  <table className="lg-table" aria-label="Unreconciled transactions">
                    <thead><tr><th style={{ width: 44 }}>Cleared</th><th>Date</th><th>Description</th><th className="lg-r">Amount</th></tr></thead>
                    <tbody>
                      {s.open.map(t => {
                        const unmatched = match ? match.unmatchedTransactions.some(u => u.id === t.id) : false;
                        return (
                          <tr key={t.id}>
                            <td><StatusDot status={t.status} onToggle={() => toggle(t.id, t.status === 'cleared')} /></td>
                            <td className="lg-muted">{formatDate(t.date)}</td>
                            <td>{t.isTransfer ? `Transfer ${t.amount < 0 ? 'to' : 'from'} ${t.transferAccountName}` : t.payee || <span className="lg-muted">No description</span>}{unmatched && <span className="lg-tag" style={{ marginLeft: 6 }}>not on statement</span>}</td>
                            <td className="lg-r"><Money minor={t.amount} tone="auto" /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="lg-section-title">History</div>
              <div className="lg-panel lg-hscroll">
                {(histQ.data || []).length === 0 ? <Empty icon="clock" title="No reconciliations yet" /> : (
                  <table className="lg-table" aria-label="Reconciliation history">
                    <thead><tr><th>Statement date</th><th className="lg-r">Statement balance</th><th className="lg-r lg-hide-sm">Transactions</th><th className="lg-hide-xs">Adjustment</th><th /></tr></thead>
                    <tbody>
                      {(histQ.data || []).map((r, i) => (
                        <tr key={r.id} style={r.undone ? { opacity: 0.55 } : undefined}>
                          <td>{formatDate(r.statementDate)}{r.undone && <span className="lg-tag" style={{ marginLeft: 6 }}>undone</span>}</td>
                          <td className="lg-r"><Money minor={r.statementBalance} /></td>
                          <td className="lg-r lg-hide-sm">{r.transactions}</td>
                          <td className="lg-hide-xs lg-muted">{r.adjustmentId ? <Money minor={r.statementBalance - r.clearedBalance} sign /> : 'None'}</td>
                          <td className="lg-r">{!r.undone && i === (histQ.data || []).findIndex(x => !x.undone) && <Btn small variant="ghost" onClick={() => undo(r)}>Undo</Btn>}</td>
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
