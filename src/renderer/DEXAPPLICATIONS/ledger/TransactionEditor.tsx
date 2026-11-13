// =============================================================================
// DEX Platform — DEX Ledger transaction editor (inspector)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Amounts are typed as positive numbers; the type (money out / money in /
// transfer) gives the sign, so a user never has to type a minus.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import DexIcon from '../../components/DexIcon';
import { ledger, LedgerError, newIdempotencyKey, type TxnDetail, type Attachment } from './ledgerApi';
import { todayLocal } from './money';
import { useLedger, Btn, IconBtn, Field, MoneyInput, CategorySelect, AccountSelect, Money, errText, type EditorRequest } from './ledgerUi';

type Kind = 'expense' | 'income' | 'transfer';
interface Line { categoryId: number | null; amount: number | null; memo: string }

export const TransactionEditor: React.FC<{ request: EditorRequest; onClose: () => void; onSaved: (id: number) => void }> = ({ request, onClose, onSaved }) => {
  const { accounts, groups, digits, toast, confirm, fmt, accountFilter } = useLedger();
  const active = accounts.filter(a => !a.archived);
  const [loaded, setLoaded] = useState<TxnDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>(request.kind || 'expense');
  const [accountId, setAccountId] = useState<number | null>(request.accountId ?? accountFilter ?? active[0]?.id ?? null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [cleared, setCleared] = useState(false);
  const [split, setSplit] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payees, setPayees] = useState<{ payee: string; lastCategoryId: number | null }[]>([]);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const isEdit = request.mode === 'edit' && request.id !== undefined;

  useEffect(() => { ledger.payees().then(setPayees).catch(() => setPayees([])); }, []);

  const load = async () => {
    if (!isEdit) return;
    try {
      const t = await ledger.txn(request.id!);
      setLoaded(t);
      setKind(t.isTransfer ? 'transfer' : t.amount > 0 ? 'income' : 'expense');
      setAccountId(t.accountId);
      setToAccountId(t.transferAccountId);
      setDate(t.date);
      setPayee(t.payee);
      setAmount(Math.abs(t.amount));
      setCategoryId(t.categoryId);
      setMemo(t.memo);
      setCleared(t.status !== 'uncleared');
      setSplit(t.isSplit);
      const sign = t.amount < 0 ? -1 : 1;
      setLines(t.splits.map(s => ({ categoryId: s.categoryId, amount: s.amount * sign, memo: s.memo })));
    } catch (e) { setLoadError(errText(e)); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [request.id]);

  const sign = kind === 'income' ? 1 : -1;
  const linesTotal = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const remaining = (amount ?? 0) - linesTotal;
  const reconciled = loaded?.status === 'reconciled';

  const canSave = useMemo(() => {
    if (!amount || amount <= 0 || !date || !accountId) return false;
    if (kind === 'transfer') return !!toAccountId && toAccountId !== accountId;
    if (split) return lines.length >= 2 && remaining === 0 && lines.every(l => l.amount);
    return true;
  }, [amount, date, accountId, kind, toAccountId, split, lines, remaining]);

  // One key per new-entry intent: a double Enter / double click, or a retry,
  // can't create the transaction twice (the engine replays the first result).
  const createKey = useRef(newIdempotencyKey());
  const inFlight = useRef(false);

  const run = async (fn: (confirmReconciled: boolean) => Promise<number>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const id = await fn(false);
      createKey.current = newIdempotencyKey(); // the next entry is a new write
      toast(isEdit ? 'Saved' : 'Transaction added', 'success');
      onSaved(id);
    } catch (e) {
      if (e instanceof LedgerError && e.message.startsWith('RECONCILED')) {
        const ok = await confirm({ title: 'Change a reconciled transaction?', message: 'It was matched to a bank statement. After this change the account won\'t match that statement until you reconcile again.', confirmLabel: 'Change it', tone: 'destructive' });
        if (ok) {
          try { const id = await fn(true); toast('Saved', 'success'); onSaved(id); } catch (e2) { setError(errText(e2)); }
        }
      } else setError(errText(e));
    } finally { inFlight.current = false; setBusy(false); }
  };

  const save = () => {
    if (!canSave || busy) return;
    const status = cleared ? 'cleared' : 'uncleared';
    if (kind === 'transfer') {
      if (isEdit && loaded) {
        return run(async (c) => {
          await ledger.updateTxn({ id: loaded.id, date, memo, amount: (loaded.amount < 0 ? -1 : 1) * amount!, ...(loaded.status !== 'reconciled' ? { status } : {}), confirmReconciled: c });
          return loaded.id;
        });
      }
      return run(async () => (await ledger.transfer({ fromAccountId: accountId!, toAccountId: toAccountId!, date, amount: amount!, memo, status, idempotencyKey: createKey.current })).id);
    }
    const splits = split ? lines.map(l => ({ categoryId: l.categoryId, amount: sign * (l.amount ?? 0), memo: l.memo })) : undefined;
    const body: Record<string, unknown> = { accountId, date, payee, memo, amount: sign * amount! };
    if (split) body.splits = splits;
    else if (isEdit && loaded?.isSplit) { body.splits = []; body.categoryId = categoryId; }
    else body.categoryId = categoryId;
    if (isEdit && loaded) {
      if (loaded.status !== 'reconciled') body.status = status;
      return run(async (c) => { await ledger.updateTxn({ id: loaded.id, ...body, confirmReconciled: c }); return loaded.id; });
    }
    return run(async () => (await ledger.createTxn({ ...body, status, idempotencyKey: createKey.current })).id);
  };

  const remove = async () => {
    if (!loaded) return;
    const ok = await confirm({ title: loaded.isTransfer ? 'Delete this transfer?' : 'Delete this transaction?', message: loaded.isTransfer ? 'Both sides of the transfer are removed.' : 'A copy is kept in the ledger history.', confirmLabel: 'Delete', tone: 'destructive' });
    if (!ok) return;
    const go = async (c: boolean) => { await ledger.deleteTxns([loaded.id], c); toast('Deleted', 'success'); onClose(); };
    try { await go(false); } catch (e) {
      if (e instanceof LedgerError && e.message.startsWith('RECONCILED')) {
        if (await confirm({ title: 'Delete a reconciled transaction?', message: 'The account will no longer match its last statement.', confirmLabel: 'Delete', tone: 'destructive' })) {
          try { await go(true); } catch (e2) { toast(errText(e2), 'error'); }
        }
      } else toast(errText(e), 'error');
    }
  };

  const startSplit = () => {
    setSplit(true);
    setLines([{ categoryId, amount: amount ?? null, memo: '' }, { categoryId: null, amount: null, memo: '' }]);
  };

  const pickPayee = (v: string) => {
    setPayee(v);
    if (!isEdit && categoryId === null && !split) {
      const hit = payees.find(p => p.payee.toLowerCase() === v.toLowerCase());
      if (hit?.lastCategoryId) setCategoryId(hit.lastCategoryId);
    }
  };

  const attach = async () => {
    if (!loaded) return;
    try { const r = await ledger.attach(loaded.id); if (!r.canceled) { toast('Receipt attached', 'success'); load(); } } catch (e) { toast(errText(e), 'error'); }
  };
  const view = async (a: Attachment) => {
    try {
      const r = await ledger.attachment(a.id);
      if (r.mime.startsWith('image/')) setPreview({ name: r.fileName, url: `data:${r.mime};base64,${r.base64}` });
      else { const s = await ledger.saveAttachment(a.id); if (!s.canceled) toast('Saved a copy', 'success'); }
    } catch (e) { toast(errText(e), 'error'); }
  };
  const detach = async (a: Attachment) => {
    if (!(await confirm({ title: `Remove ${a.fileName}?`, confirmLabel: 'Remove', tone: 'destructive' }))) return;
    try { await ledger.deleteAttachment(a.id); load(); } catch (e) { toast(errText(e), 'error'); }
  };

  if (loadError) return <><Head title="Transaction" onClose={onClose} /><div className="lg-inspector-body"><div className="lg-banner lg-error">{loadError}</div></div></>;
  if (isEdit && !loaded) return <><Head title="Transaction" onClose={onClose} /><div className="lg-inspector-body lg-muted">Loading…</div></>;
  if (!active.length && !isEdit) {
    return <><Head title="New transaction" onClose={onClose} /><div className="lg-inspector-body"><div className="lg-banner">Add an account first. Transactions always belong to an account.</div></div></>;
  }

  return (
    <form
      style={{ display: 'contents' }}
      onSubmit={e => { e.preventDefault(); save(); }}
      onKeyDown={e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); save(); }
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      }}
    >
      <Head title={isEdit ? (kind === 'transfer' ? 'Transfer' : 'Transaction') : 'New transaction'} onClose={onClose} />
      <div className="lg-inspector-body">
        {!isEdit && (
          <div className="lg-segment" role="group" aria-label="Type" style={{ alignSelf: 'flex-start' }}>
            {(['expense', 'income', 'transfer'] as Kind[]).map(k => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); if (k === 'transfer') setSplit(false); }}>
                {k === 'expense' ? 'Money out' : k === 'income' ? 'Money in' : 'Transfer'}
              </button>
            ))}
          </div>
        )}
        {isEdit && kind !== 'transfer' && (
          <div className="lg-segment" role="group" aria-label="Direction" style={{ alignSelf: 'flex-start' }}>
            <button type="button" aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>Money out</button>
            <button type="button" aria-pressed={kind === 'income'} onClick={() => setKind('income')}>Money in</button>
          </div>
        )}
        {reconciled && <div className="lg-banner"><DexIcon name="lock" size={12} color="currentColor" /> Reconciled on a statement. Notes can change freely; amounts and dates ask first.</div>}

        <Field label={kind === 'transfer' ? 'From account' : 'Account'}>
          {isEdit && kind === 'transfer'
            ? <input className="lg-input" disabled value={loaded?.accountName || ''} aria-label="Account" />
            : <AccountSelect value={accountId} onChange={setAccountId} accounts={active.concat(loaded && !active.some(a => a.id === loaded.accountId) ? accounts.filter(a => a.id === loaded.accountId) : [])} ariaLabel="Account" />}
        </Field>
        {kind === 'transfer' && (
          <Field label="To account" hint="Transfers move money between your accounts. They are not income or spending.">
            {isEdit
              ? <input className="lg-input" disabled value={loaded?.transferAccountName || ''} aria-label="To account" />
              : <AccountSelect value={toAccountId} onChange={setToAccountId} accounts={active} exclude={accountId} ariaLabel="To account" />}
          </Field>
        )}
        <div className="lg-grid2">
          <Field label="Date"><input className="lg-input" type="date" required value={date} onChange={e => setDate(e.target.value)} aria-label="Date" /></Field>
          <Field label="Amount"><MoneyInput value={amount} digits={digits} onChange={setAmount} ariaLabel="Amount" autoFocus={!isEdit} /></Field>
        </div>
        {kind !== 'transfer' && (
          <Field label="Description">
            <input className="lg-input" list="lg-payees" value={payee} maxLength={200} onChange={e => pickPayee(e.target.value)} aria-label="Description" placeholder={kind === 'income' ? 'Who paid you' : 'Who you paid'} />
            <datalist id="lg-payees">{payees.slice(0, 200).map(p => <option key={p.payee} value={p.payee} />)}</datalist>
          </Field>
        )}

        {kind !== 'transfer' && !split && (
          <Field label="Category">
            <div style={{ display: 'flex', gap: 6 }}>
              <CategorySelect value={categoryId} onChange={setCategoryId} groups={groups} ariaLabel="Category" includeArchivedId={loaded?.categoryId} />
              <Btn small onClick={startSplit} title="Split across categories">Split</Btn>
            </div>
          </Field>
        )}
        {kind !== 'transfer' && split && (
          <div className="lg-field">
            <span className="lg-field-label">Split across categories</span>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 24px', gap: 6, alignItems: 'start' }}>
                <CategorySelect value={l.categoryId} groups={groups} ariaLabel={`Split ${i + 1} category`} onChange={v => setLines(ls => ls.map((x, j) => j === i ? { ...x, categoryId: v } : x))} />
                <MoneyInput value={l.amount} digits={digits} allowNegative ariaLabel={`Split ${i + 1} amount`} onChange={v => setLines(ls => ls.map((x, j) => j === i ? { ...x, amount: v } : x))} />
                <IconBtn icon="close" label={`Remove split ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} />
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <Btn small variant="ghost" icon="plus" onClick={() => setLines(ls => [...ls, { categoryId: null, amount: remaining > 0 ? remaining : null, memo: '' }])}>Add line</Btn>
              <span className="lg-spacer" />
              <span className={remaining === 0 ? 'lg-muted' : ''} style={remaining !== 0 ? { color: 'var(--color-error)' } : undefined}>
                {remaining === 0 ? 'Lines add up' : remaining > 0 ? `${fmt(remaining)} left to split` : `${fmt(-remaining)} over`}
              </span>
            </div>
            <Btn small variant="ghost" onClick={() => { setSplit(false); setCategoryId(lines[0]?.categoryId ?? null); }}>Use one category</Btn>
          </div>
        )}

        <Field label="Notes"><textarea className="lg-input" rows={2} maxLength={2000} value={memo} onChange={e => setMemo(e.target.value)} aria-label="Notes" /></Field>
        {!reconciled && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={cleared} onChange={e => setCleared(e.target.checked)} />
            Cleared (it has appeared on your bank statement or app)
          </label>
        )}

        {isEdit && loaded && (
          <div className="lg-field">
            <span className="lg-field-label">Receipts</span>
            {loaded.attachments.length === 0 && <span className="lg-muted" style={{ fontSize: 12 }}>None attached. Receipts are stored inside the ledger and included in backups.</span>}
            {loaded.attachments.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                <DexIcon name="paperclip" size={12} color="var(--color-text-tertiary)" />
                <button type="button" className="lg-btn lg-btn-ghost lg-btn-sm" style={{ flex: 1, justifyContent: 'flex-start', overflow: 'hidden' }} onClick={() => view(a)} title={a.mime.startsWith('image/') ? 'View' : 'Save a copy'}>{a.fileName}</button>
                <span className="lg-muted">{Math.max(1, Math.round(a.size / 1024))} KB</span>
                <IconBtn icon="download" label={`Save a copy of ${a.fileName}`} onClick={async () => { try { const s = await ledger.saveAttachment(a.id); if (!s.canceled) toast('Saved a copy', 'success'); } catch (e) { toast(errText(e), 'error'); } }} />
                <IconBtn icon="trash" label={`Remove ${a.fileName}`} onClick={() => detach(a)} />
              </div>
            ))}
            <Btn small icon="paperclip" onClick={attach} style={{ alignSelf: 'flex-start' }}>Attach receipt…</Btn>
          </div>
        )}
        {!isEdit && <span className="lg-muted" style={{ fontSize: 11.5 }}>You can attach receipts after saving.</span>}

        {error && <div className="lg-banner lg-error" role="alert">{error}</div>}
        {loaded && (
          <div className="lg-muted" style={{ fontSize: 11.5 }}>
            Stored amount: <Money minor={loaded.amount} sign /> · Status: {loaded.status}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--color-border-subtle)' }}>
        {isEdit && <Btn variant="danger" icon="trash" onClick={remove}>Delete</Btn>}
        <span className="lg-spacer" />
        <Btn variant="ghost" onClick={onClose}>{isEdit ? 'Close' : 'Cancel'}</Btn>
        <button type="submit" className="lg-btn lg-btn-primary" disabled={!canSave || busy}>{busy ? 'Saving…' : isEdit ? 'Save' : 'Add'}</button>
      </div>
      {preview && (
        <div className="lg-modal-backdrop" onMouseDown={() => setPreview(null)} role="dialog" aria-label={preview.name}>
          <img src={preview.url} alt={preview.name} style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,.5)' }} />
        </div>
      )}
    </form>
  );
};

const Head: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => (
  <div className="lg-inspector-head">
    <span style={{ flex: 1 }}>{title}</span>
    <IconBtn icon="close" label="Close details" onClick={onClose} />
  </div>
);
