// =============================================================================
// DEX Platform — DEX Ledger CSV import
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Pick a bank CSV → check how its columns and dates were read → choose rows →
// import. Duplicates (already in the ledger) are detected and left unticked.
// A backup is made automatically right before the import.

import React, { useEffect, useMemo, useState } from 'react';
import { ledger, type CsvMapping, type CsvPreview } from './ledgerApi';
import { formatDate, localeDateOrder, localeDecimalSeparator } from './money';
import { useLedger, Modal, Btn, Field, AccountSelect, Money, errText } from './ledgerUi';

const ROLE_LABELS: { key: keyof CsvMapping; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'payee', label: 'Description' },
  { key: 'amount', label: 'Amount' },
  { key: 'debit', label: 'Money out' },
  { key: 'credit', label: 'Money in' },
  { key: 'memo', label: 'Notes' },
  { key: 'category', label: 'Category' },
];

export const ImportDialog: React.FC<{ initialAccountId: number | null; onClose: () => void }> = ({ initialAccountId, onClose }) => {
  const { accounts, toast, go } = useLedger();
  const active = accounts.filter(a => !a.archived);
  const [accountId, setAccountId] = useState<number | null>(initialAccountId ?? active[0]?.id ?? null);
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [dateFormat, setDateFormat] = useState<'auto' | 'dmy' | 'mdy'>('auto');
  const [decimal, setDecimal] = useState<'.' | ','>(localeDecimalSeparator());
  const [invert, setInvert] = useState(false);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    setError(null);
    try {
      const f = await ledger.openCsv();
      if (f.canceled || f.content === undefined) return;
      setFile({ name: f.name || 'file.csv', content: f.content });
      setMapping(null);
    } catch (e) { setError(errText(e)); }
  };

  useEffect(() => {
    if (!file || !accountId) return;
    let alive = true;
    ledger.csvPreview({ accountId, content: file.content, mapping: mapping ?? undefined, dateFormat, decimal, invert, dateOrder: localeDateOrder() })
      .then(p => {
        if (!alive) return;
        setPreview(p);
        if (!mapping) setMapping(p.mapping);
        setSelected(new Set(p.rows.filter(r => !r.error && !r.duplicate).map(r => r.line)));
        setError(null);
      })
      .catch(e => { if (alive) { setPreview(null); setError(errText(e)); } });
    return () => { alive = false; };
  }, [file, accountId, mapping, dateFormat, decimal, invert]);

  const rows = preview?.rows || [];
  const chosen = useMemo(() => rows.filter(r => selected.has(r.line) && !r.error && r.date && r.amount !== null), [rows, selected]);
  const total = chosen.reduce((s, r) => s + (r.amount || 0), 0);

  const run = async () => {
    if (!accountId || !chosen.length) return;
    setBusy(true);
    try {
      const r = await ledger.csvImport(accountId, chosen.map(c => ({ date: c.date!, payee: c.payee, memo: c.memo, amount: c.amount!, categoryId: c.categoryId })), true);
      toast(`Imported ${r.imported} transaction${r.imported === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} duplicate${r.skipped === 1 ? '' : 's'}` : ''}`, 'success');
      go('transactions', { accountId });
      onClose();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  const setRole = (key: keyof CsvMapping, col: number | null) => {
    if (!mapping) return;
    const next: CsvMapping = { ...mapping, [key]: col };
    if (key === 'amount' && col !== null) { next.debit = null; next.credit = null; }
    if ((key === 'debit' || key === 'credit') && col !== null) next.amount = null;
    setMapping(next);
  };

  return (
    <Modal title="Import transactions from CSV" onClose={onClose} width={900}
      footer={
        <>
          {preview && <span className="lg-muted" style={{ marginRight: 'auto', fontSize: 12.5 }}>{chosen.length} selected · total <Money minor={total} sign /></span>}
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!chosen.length || busy} onClick={run}>{busy ? 'Importing…' : `Import ${chosen.length}`}</Btn>
        </>
      }>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Into account"><div style={{ width: 220 }}><AccountSelect value={accountId} onChange={setAccountId} accounts={active} ariaLabel="Account to import into" /></div></Field>
        <Btn variant={file ? 'default' : 'primary'} icon="file-text" onClick={choose}>{file ? 'Choose another file…' : 'Choose CSV file…'}</Btn>
        {file && <span className="lg-muted" style={{ paddingBottom: 6 }}>{file.name}</span>}
      </div>
      {!file && <div className="lg-muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Export a CSV from your bank's website or app, then choose it here. DEX reads the file on this computer only; nothing is sent anywhere.</div>}
      {error && <div className="lg-banner lg-error" role="alert">{error}</div>}

      {preview && mapping && (
        <>
          <div className="lg-section-title" style={{ marginTop: 6 }}>How the columns were read</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {ROLE_LABELS.map(r => (
              <Field key={r.key} label={r.label}>
                <select className="lg-input" aria-label={`${r.label} column`} value={mapping[r.key] ?? ''} onChange={e => setRole(r.key, e.target.value === '' ? null : Number(e.target.value))}>
                  <option value="">Not used</option>
                  {preview.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </Field>
            ))}
            <Field label="Dates" hint={preview.dateAmbiguous && dateFormat === 'auto' ? 'Ambiguous: check the dates below' : undefined}>
              <select className="lg-input" aria-label="Date order" value={dateFormat} onChange={e => setDateFormat(e.target.value as typeof dateFormat)}>
                <option value="auto">Detect ({preview.dateFormat === 'dmy' ? 'day first' : 'month first'})</option>
                <option value="dmy">Day / month / year</option>
                <option value="mdy">Month / day / year</option>
              </select>
            </Field>
            <Field label="Decimal separator">
              <select className="lg-input" aria-label="Decimal separator" value={decimal} onChange={e => setDecimal(e.target.value as '.' | ',')}>
                <option value=".">Point (1,234.56)</option><option value=",">Comma (1.234,56)</option>
              </select>
            </Field>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
            <input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} />
            Flip signs (use if spending shows as positive, as many credit card exports do)
          </label>
          {preview.duplicateCount > 0 && <div className="lg-banner">{preview.duplicateCount} row{preview.duplicateCount === 1 ? ' is' : 's are'} already in this account and left unticked.</div>}
          {preview.errorCount > 0 && <div className="lg-banner lg-warn">{preview.errorCount} row{preview.errorCount === 1 ? '' : 's'} couldn't be read and won't be imported.</div>}
          <div className="lg-panel" style={{ maxHeight: 320, overflow: 'auto' }}>
            <table className="lg-table" aria-label="Rows to import">
              <thead>
                <tr>
                  <th style={{ width: 28 }}><input type="checkbox" aria-label="Select all rows" checked={chosen.length > 0 && chosen.length === rows.filter(r => !r.error).length} onChange={e => setSelected(e.target.checked ? new Set(rows.filter(r => !r.error).map(r => r.line)) : new Set())} /></th>
                  <th>Line</th><th>Date</th><th>Description</th><th className="lg-hide-sm">Category</th><th className="lg-r">Amount</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 2000).map(r => (
                  <tr key={r.line} style={r.error ? { opacity: 0.7 } : undefined}>
                    <td><input type="checkbox" aria-label={`Import line ${r.line}`} disabled={!!r.error} checked={selected.has(r.line) && !r.error} onChange={() => setSelected(s => { const n = new Set(s); if (n.has(r.line)) n.delete(r.line); else n.add(r.line); return n; })} /></td>
                    <td className="lg-muted">{r.line}</td>
                    <td>{r.date ? formatDate(r.date) : '—'}</td>
                    <td>{r.payee || <span className="lg-muted">—</span>}</td>
                    <td className="lg-hide-sm lg-muted">{r.categoryId ? r.categoryName : r.categoryName ? `${r.categoryName} (no match)` : ''}</td>
                    <td className="lg-r">{r.amount !== null ? <Money minor={r.amount} tone="auto" /> : '—'}</td>
                    <td>{r.error ? <span style={{ color: 'var(--color-error)', fontSize: 12 }}>{r.error}</span> : r.duplicate ? <span className="lg-tag">duplicate</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 2000 && <div className="lg-muted" style={{ fontSize: 12 }}>Showing the first 2,000 of {rows.length} rows; all selected rows are imported.</div>}
        </>
      )}
    </Modal>
  );
};
