// =============================================================================
// DEX Platform — DEX Ledger accounts + scheduled transactions
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import React, { useState } from 'react';
import { ledger, ACCOUNT_KIND_SINGULAR, type Account, type Recurring } from '../ledgerApi';
import { formatDate, todayLocal } from '../money';
import { useLedger, useLedgerQuery, Money, Btn, IconBtn, Empty, Modal, Field, MoneyInput, CategorySelect, AccountSelect, errText } from '../ledgerUi';
import { AccountDialog } from '../AccountDialog';

export const AccountsView: React.FC<{ onNewAccount: () => void }> = ({ onNewAccount }) => {
  const { accounts, go, toast, confirm } = useLedger();
  const [editing, setEditing] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sched, setSched] = useState<Recurring | 'new' | null>(null);
  const recQ = useLedgerQuery(() => ledger.recurring(), []);
  const list = accounts.filter(a => showArchived || !a.archived);

  const archive = async (a: Account) => {
    if (!a.archived) {
      const ok = await confirm({ title: `Archive ${a.name}?`, message: 'Archived accounts keep their history and stay in reports, but you can\'t add new transactions to them. Scheduled transactions for this account are removed.', confirmLabel: 'Archive' });
      if (!ok) return;
    }
    try { await ledger.archiveAccount(a.id, !a.archived); } catch (e) { toast(errText(e), 'error'); }
  };
  const remove = async (a: Account) => {
    if (!(await confirm({ title: `Delete ${a.name}?`, message: 'Only an account with no history can be deleted.', confirmLabel: 'Delete', tone: 'destructive' }))) return;
    try { await ledger.deleteAccount(a.id); toast('Account deleted', 'success'); } catch (e) { toast(errText(e), 'error'); }
  };
  const move = async (a: Account, dir: -1 | 1) => {
    const ids = accounts.filter(x => !x.archived).map(x => x.id);
    const i = ids.indexOf(a.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await ledger.reorderAccounts(ids); } catch (e) { toast(errText(e), 'error'); }
  };

  return (
    <>
      <div className="lg-toolbar">
        <h1>Accounts</h1>
        <span className="lg-spacer" />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
        </label>
        <Btn small variant="primary" icon="plus" onClick={onNewAccount}>Add account</Btn>
      </div>
      <div className="lg-scroll">
        <div className="lg-pad">
          {list.length === 0 ? (
            <Empty icon="landmark" title="No accounts">Add each place your money lives (bank account, cash, savings, credit card) with its current balance.</Empty>
          ) : (
            <div className="lg-panel lg-hscroll">
              <table className="lg-table" aria-label="Accounts">
                <thead>
                  <tr>
                    <th>Account</th><th className="lg-hide-xs">Type</th><th className="lg-r">Balance</th><th className="lg-r lg-hide-sm">Cleared</th>
                    <th className="lg-hide-sm">Last reconciled</th><th className="lg-r lg-hide-sm">Transactions</th><th />
                  </tr>
                </thead>
                <tbody>
                  {list.map(a => (
                    <tr key={a.id}>
                      <td>
                        <button type="button" className="lg-btn lg-btn-ghost lg-btn-sm" style={{ color: 'var(--color-text-primary)' }} onClick={() => go('transactions', { accountId: a.id })}>{a.name}</button>
                        {a.archived && <span className="lg-tag">archived</span>}
                      </td>
                      <td className="lg-muted lg-hide-xs">{ACCOUNT_KIND_SINGULAR[a.kind]}</td>
                      <td className="lg-r" style={a.balance < 0 ? { color: 'var(--color-error)' } : undefined}><Money minor={a.balance} /></td>
                      <td className="lg-r lg-muted lg-hide-sm"><Money minor={a.clearedBalance} /></td>
                      <td className="lg-muted lg-hide-sm">{a.lastReconciled ? formatDate(a.lastReconciled) : 'Never'}</td>
                      <td className="lg-r lg-muted lg-hide-sm">{a.transactionCount}</td>
                      <td className="lg-r" style={{ width: 210 }}>
                        {!a.archived && <IconBtn icon="arrow-up" label={`Move ${a.name} up`} onClick={() => move(a, -1)} />}
                        {!a.archived && <IconBtn icon="arrow-down" label={`Move ${a.name} down`} onClick={() => move(a, 1)} />}
                        <IconBtn icon="edit" label={`Edit ${a.name}`} onClick={() => setEditing(a)} />
                        {!a.archived && <IconBtn icon="check-square" label={`Reconcile ${a.name}`} onClick={() => go('reconcile', { accountId: a.id })} />}
                        <IconBtn icon="archive" label={a.archived ? `Unarchive ${a.name}` : `Archive ${a.name}`} onClick={() => archive(a)} />
                        {a.transactionCount === 0 && <IconBtn icon="trash" label={`Delete ${a.name}`} onClick={() => remove(a)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="lg-section-title">
            Scheduled transactions
            <span className="lg-spacer" />
            <Btn small icon="plus" disabled={!accounts.some(a => !a.archived)} onClick={() => setSched('new')}>Schedule</Btn>
          </div>
          <div className="lg-muted" style={{ fontSize: 12, marginBottom: 8 }}>Bills and income that repeat. DEX lists them on the Overview when they're due and enters one only when you press Enter.</div>
          <div className="lg-panel lg-hscroll">
            {(recQ.data || []).length === 0 ? <Empty icon="calendar" title="Nothing scheduled" /> : (
              <table className="lg-table" aria-label="Scheduled transactions">
                <thead><tr><th>Next</th><th>Description</th><th className="lg-hide-sm">Account</th><th className="lg-hide-xs">Repeats</th><th className="lg-r">Amount</th><th /></tr></thead>
                <tbody>
                  {(recQ.data || []).map(r => (
                    <tr key={r.id}>
                      <td className="lg-muted">{formatDate(r.nextDate)}</td>
                      <td>{r.transferAccountId ? `Transfer to ${r.transferAccountName}` : r.payee || <span className="lg-muted">No description</span>}{r.categoryName && <span className="lg-muted"> · {r.categoryName}</span>}</td>
                      <td className="lg-muted lg-hide-sm">{r.accountName}</td>
                      <td className="lg-muted lg-hide-xs">{r.frequency}</td>
                      <td className="lg-r"><Money minor={r.transferAccountId ? -r.amount : r.amount} tone="auto" /></td>
                      <td className="lg-r" style={{ width: 80 }}>
                        <IconBtn icon="edit" label="Edit schedule" onClick={() => setSched(r)} />
                        <IconBtn icon="trash" label="Delete schedule" onClick={async () => { if (await confirm({ title: 'Delete this schedule?', message: 'Transactions already entered are kept.', confirmLabel: 'Delete', tone: 'destructive' })) { try { await ledger.deleteRecurring(r.id); } catch (e) { toast(errText(e), 'error'); } } }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {editing && <AccountDialog account={editing} onClose={() => setEditing(null)} />}
      {sched && <ScheduleDialog existing={sched === 'new' ? null : sched} onClose={() => setSched(null)} />}
    </>
  );
};

const ScheduleDialog: React.FC<{ existing: Recurring | null; onClose: () => void }> = ({ existing, onClose }) => {
  const { accounts, groups, digits, toast } = useLedger();
  const active = accounts.filter(a => !a.archived);
  const [kind, setKind] = useState<'expense' | 'income' | 'transfer'>(existing ? (existing.transferAccountId ? 'transfer' : existing.amount > 0 ? 'income' : 'expense') : 'expense');
  const [accountId, setAccountId] = useState<number | null>(existing?.accountId ?? active[0]?.id ?? null);
  const [toAccountId, setToAccountId] = useState<number | null>(existing?.transferAccountId ?? null);
  const [payee, setPayee] = useState(existing?.payee || '');
  const [amount, setAmount] = useState<number | null>(existing ? Math.abs(existing.amount) : null);
  const [categoryId, setCategoryId] = useState<number | null>(existing?.categoryId ?? null);
  const [frequency, setFrequency] = useState<Recurring['frequency']>(existing?.frequency || 'monthly');
  const [nextDate, setNextDate] = useState(existing?.nextDate || todayLocal());
  const [memo, setMemo] = useState(existing?.memo || '');
  const ok = !!accountId && !!amount && !!nextDate && (kind !== 'transfer' || (!!toAccountId && toAccountId !== accountId));
  const save = async () => {
    if (!ok) return;
    const body = {
      accountId, transferAccountId: kind === 'transfer' ? toAccountId : null, payee, memo,
      amount: kind === 'expense' ? -amount! : amount!, categoryId: kind === 'transfer' ? null : categoryId, frequency, nextDate,
    };
    try {
      if (existing) await ledger.updateRecurring({ id: existing.id, ...body }); else await ledger.createRecurring(body);
      onClose();
    } catch (e) { toast(errText(e), 'error'); }
  };
  return (
    <Modal title={existing ? 'Edit schedule' : 'Schedule a transaction'} onClose={onClose} width={480}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!ok} onClick={save}>Save</Btn></>}>
      <div className="lg-segment" role="group" aria-label="Type" style={{ alignSelf: 'flex-start' }}>
        {(['expense', 'income', 'transfer'] as const).map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'expense' ? 'Money out' : k === 'income' ? 'Money in' : 'Transfer'}</button>)}
      </div>
      <div className="lg-grid2">
        <Field label={kind === 'transfer' ? 'From account' : 'Account'}><AccountSelect value={accountId} onChange={setAccountId} accounts={active} ariaLabel="Account" /></Field>
        {kind === 'transfer'
          ? <Field label="To account"><AccountSelect value={toAccountId} onChange={setToAccountId} accounts={active} exclude={accountId} ariaLabel="To account" /></Field>
          : <Field label="Category"><CategorySelect value={categoryId} onChange={setCategoryId} groups={groups} ariaLabel="Category" /></Field>}
      </div>
      {kind !== 'transfer' && <Field label="Description"><input className="lg-input" value={payee} onChange={e => setPayee(e.target.value)} maxLength={200} /></Field>}
      <div className="lg-grid2">
        <Field label="Amount"><MoneyInput value={amount} digits={digits} onChange={setAmount} ariaLabel="Amount" /></Field>
        <Field label="Repeats">
          <select className="lg-input" value={frequency} onChange={e => setFrequency(e.target.value as Recurring['frequency'])} aria-label="Repeats">
            <option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="quarterly">Every 3 months</option><option value="yearly">Yearly</option>
          </select>
        </Field>
      </div>
      <Field label="Next date"><input className="lg-input" type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} aria-label="Next date" /></Field>
      <Field label="Notes"><input className="lg-input" value={memo} onChange={e => setMemo(e.target.value)} maxLength={2000} /></Field>
    </Modal>
  );
};
