// =============================================================================
// DEX Platform — DEX Ledger backups, restore, currency, history, integrity
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import React, { useState } from 'react';
import { ledger, type AuditEntry, type Backup } from '../ledgerApi';
import { CURRENCIES } from '../money';
import { useLedger, useLedgerQuery, Btn, Empty, Field, errText } from '../ledgerUi';

function when(ms: number): string {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)); } catch { return String(ms); }
}
function size(b: number): string { return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`; }
const LABELS: Record<string, string> = { manual: 'Manual', 'before-import': 'Before CSV import', 'before-restore': 'Before restore' };

export const DataView: React.FC = () => {
  const { toast, confirm, currency, status } = useLedger();
  const backupsQ = useLedgerQuery<Backup[]>(() => ledger.backups(), []);
  const auditQ = useLedgerQuery<AuditEntry[]>(() => ledger.audit(150), []);
  const [check, setCheck] = useState<{ ok: boolean; sqlite: string; foreignKeyViolations: number; issues: unknown[] } | null>(null);
  const [cur, setCur] = useState(currency);

  const backupNow = async () => { try { const b = await ledger.backup(); toast(`Backup saved (${size(b.size)})`, 'success'); backupsQ.reload(); } catch (e) { toast(errText(e), 'error'); } };
  const restore = async (b: Backup) => {
    const ok = await confirm({ title: `Restore the backup from ${when(b.createdAt)}?`, message: 'Your current ledger is replaced by this backup. DEX first saves a "Before restore" backup of the current data, so you can switch back.', confirmLabel: 'Restore', tone: 'destructive' });
    if (!ok) return;
    try { await ledger.restore(b.file); toast('Backup restored', 'success'); backupsQ.reload(); } catch (e) { toast(errText(e), 'error'); }
  };
  const restoreFile = async () => {
    const ok = await confirm({ title: 'Restore from a backup file?', message: 'Choose a DEX Ledger backup (.db). It is checked before anything changes, and your current data is backed up first.', confirmLabel: 'Choose file…' });
    if (!ok) return;
    try { const r = await ledger.importBackup(); if (r.restored) toast('Backup restored', 'success'); } catch (e) { toast(errText(e), 'error'); }
  };
  const changeCurrency = async () => {
    if (cur === currency) return;
    try { await ledger.setCurrency(cur); toast(`Currency set to ${cur}`, 'success'); } catch (e) { toast(errText(e), 'error'); setCur(currency); }
  };

  return (
    <>
      <div className="lg-toolbar"><h1>Backups &amp; history</h1></div>
      <div className="lg-scroll">
        <div className="lg-pad" style={{ maxWidth: 900 }}>
          <div className="lg-banner">
            Your ledger is a single local database on this computer. It is never uploaded, and it is kept separate from the rest of DEX. Back it up to another drive from time to time with "Export backup file".
          </div>

          <div className="lg-section-title">
            Backups
            <span className="lg-spacer" />
            <Btn small variant="primary" icon="shield" onClick={backupNow}>Back up now</Btn>
            <Btn small icon="export" onClick={async () => { try { const r = await ledger.exportBackup(); if (!r.canceled) toast('Backup file saved', 'success'); } catch (e) { toast(errText(e), 'error'); } }}>Export backup file…</Btn>
            <Btn small icon="import" onClick={restoreFile}>Restore from file…</Btn>
            <Btn small variant="ghost" icon="folder" onClick={() => ledger.openBackupFolder().catch(e => toast(errText(e), 'error'))}>Open folder</Btn>
          </div>
          <div className="lg-panel lg-hscroll">
            {(backupsQ.data || []).length === 0 ? <Empty icon="shield" title="No backups yet">DEX also makes one automatically before every CSV import and restore.</Empty> : (
              <table className="lg-table" aria-label="Backups">
                <thead><tr><th>Created</th><th>Kind</th><th className="lg-r lg-hide-xs">Size</th><th /></tr></thead>
                <tbody>
                  {(backupsQ.data || []).map(b => (
                    <tr key={b.file}>
                      <td title={b.file}>{when(b.createdAt)}</td>
                      <td className="lg-muted">{LABELS[b.label] || b.label}</td>
                      <td className="lg-r lg-muted lg-hide-xs">{size(b.size)}</td>
                      <td className="lg-r"><Btn small onClick={() => restore(b)}>Restore…</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="lg-section-title">Currency</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Field label="Ledger currency" hint="Relabels amounts only; DEX doesn't convert between currencies. A currency with a different number of decimal places can't be chosen once amounts exist.">
              <select className="lg-input" style={{ width: 140 }} value={cur} onChange={e => setCur(e.target.value)} aria-label="Ledger currency">
                {!CURRENCIES.includes(currency) && <option value={currency}>{currency}</option>}
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Btn small disabled={cur === currency} onClick={changeCurrency}>Apply</Btn>
          </div>

          <div className="lg-section-title">
            Integrity
            <span className="lg-spacer" />
            <Btn small onClick={async () => { try { setCheck(await ledger.integrity()); } catch (e) { toast(errText(e), 'error'); } }}>Check now</Btn>
          </div>
          {check ? (
            <div className={`lg-banner ${check.ok ? '' : 'lg-error'}`}>
              {check.ok ? `Database is healthy (${status.transactionCount} transactions, schema v${status.schemaVersion}).` : `Problems found: SQLite says "${check.sqlite}", ${check.foreignKeyViolations} broken references, ${check.issues.length} ledger rule issue(s). Restore a backup or contact support; DEX has not changed anything.`}
            </div>
          ) : <div className="lg-muted" style={{ fontSize: 12 }}>Checks the database file and the ledger's own rules (splits add up, transfers are balanced). Read-only.</div>}

          <div className="lg-section-title">History</div>
          <div className="lg-muted" style={{ fontSize: 12, marginBottom: 8 }}>Every change to the ledger is recorded here, including the full contents of deleted transactions.</div>
          <div className="lg-panel lg-hscroll">
            {(auditQ.data || []).length === 0 ? <Empty icon="clock" title="No changes yet" /> : (
              <table className="lg-table" aria-label="Change history">
                <thead><tr><th>When</th><th>Change</th><th className="lg-hide-sm">Details</th></tr></thead>
                <tbody>
                  {(auditQ.data || []).map(a => (
                    <tr key={a.id}>
                      <td className="lg-muted" style={{ width: 170 }}>{when(a.ts)}</td>
                      <td>{a.action} {a.entity}{a.entityId ? ` #${a.entityId}` : ''}</td>
                      <td className="lg-muted lg-hide-sm" style={{ maxWidth: 420 }} title={JSON.stringify(a.detail)}>{JSON.stringify(a.detail)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
