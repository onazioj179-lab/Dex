// =============================================================================
// DEX Platform — DEX Ledger: create / edit account
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import React, { useState } from 'react';
import { ledger, LedgerError, ACCOUNT_KINDS, ACCOUNT_KIND_SINGULAR, type Account, type AccountKind } from './ledgerApi';
import { todayLocal } from './money';
import { useLedger, Modal, Field, Btn, MoneyInput, errText } from './ledgerUi';

export const AccountDialog: React.FC<{ onClose: () => void; account?: Account }> = ({ onClose, account }) => {
  const { digits, toast, confirm, go } = useLedger();
  const [name, setName] = useState(account?.name || '');
  const [kind, setKind] = useState<AccountKind>(account?.kind || 'checking');
  const [owed, setOwed] = useState(account ? account.kind === 'credit' && account.openingBalance < 0 : true);
  const [opening, setOpening] = useState<number | null>(account ? Math.abs(account.openingBalance) : null);
  const [openingDate, setOpeningDate] = useState(account?.openingDate || todayLocal());
  const [notes, setNotes] = useState(account?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Credit balances are money owed: stored negative.
  const signedOpening = (opening ?? 0) * (kind === 'credit' && owed ? -1 : 1);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (account) {
        const patch = { id: account.id, name: name.trim(), kind, notes, openingDate, openingBalance: signedOpening };
        try { await ledger.updateAccount(patch); }
        catch (e) {
          if (e instanceof LedgerError && e.message.startsWith('RECONCILED')) {
            if (!(await confirm({ title: 'Change the opening balance of a reconciled account?', message: 'Reconciled balances will shift by the same amount.', confirmLabel: 'Change it', tone: 'destructive' }))) { setBusy(false); return; }
            await ledger.updateAccount({ ...patch, confirmReconciled: true });
          } else throw e;
        }
        toast('Account saved', 'success');
      } else {
        const r = await ledger.createAccount({ name: name.trim(), kind, openingBalance: signedOpening, openingDate, notes });
        toast(`Added ${name.trim()}`, 'success');
        go('transactions', { accountId: r.id });
      }
      onClose();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  return (
    <Modal title={account ? `Edit ${account.name}` : 'Add account'} onClose={onClose} width={460}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!name.trim() || busy} onClick={save}>{account ? 'Save' : 'Add account'}</Btn></>}>
      <Field label="Name"><input className="lg-input" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="e.g. Main current account" onKeyDown={e => e.key === 'Enter' && save()} /></Field>
      <Field label="Type">
        <select className="lg-input" value={kind} onChange={e => setKind(e.target.value as AccountKind)} aria-label="Account type">
          {ACCOUNT_KINDS.map(k => <option key={k} value={k}>{ACCOUNT_KIND_SINGULAR[k]}</option>)}
        </select>
      </Field>
      <div className="lg-grid2">
        <Field label={kind === 'credit' ? 'Balance on the opening date' : 'Opening balance'} hint="What the account held on the opening date. Enter 0 for a new account.">
          <MoneyInput value={opening} digits={digits} onChange={setOpening} ariaLabel="Opening balance" />
        </Field>
        <Field label="Opening date"><input className="lg-input" type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} aria-label="Opening date" /></Field>
      </div>
      {kind === 'credit' && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
          <input type="checkbox" checked={owed} onChange={e => setOwed(e.target.checked)} />
          This is money I owe (most credit cards)
        </label>
      )}
      <Field label="Notes (optional)"><textarea className="lg-input" rows={2} value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder="Account number ending, branch, anything useful. Don't store passwords here." /></Field>
      {error && <div className="lg-banner lg-error" role="alert">{error}</div>}
    </Modal>
  );
};
