// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Backup & Sync — local-first, encrypted backup of all DEX data.
 *
 * Real crypto via src/shared/cloud/encryption (AES-GCM-256 + PBKDF2-SHA256).
 * Real FS via the window.dex bridge; Blob/file-input fallback in the web preview.
 * No server. The UI just orchestrates the backupSync service.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SegmentedControl } from '../../components/controls';
import {
  exportEncrypted,
  importEncrypted,
  restore,
  pickBackupFile,
  getRecentBackups,
  clearRecentBackups,
  passphraseAcceptable,
  hasNativeFs,
  pickSyncFolder,
  syncOutToFolder,
  listFolderBackups,
  syncInFromFile,
  type RestoreMode,
  type RestoreSummary,
  type RecentBackup,
  type BackupPayload,
  type FolderBackupEntry,
} from '../../services/backupSync';
import { useWorkingPhrase } from '../../hooks/useWorkingPhrase';

function toast(type: 'success' | 'error' | 'warning' | 'info', message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch {
    /* feedback must never throw */
  }
}

function formatWhen(ts: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(ts).toISOString();
  }
}

const KIND_LABEL: Record<RecentBackup['kind'], string> = {
  export: 'Exported',
  restore: 'Restored',
  'sync-out': 'Synced out',
  'sync-in': 'Synced in',
};

const BackupSync: React.FC = () => {
  const native = useMemo(() => hasNativeFs(), []);

  const [passphrase, setPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState<null | string>(null);
  // Live crypto verbs per operation, replacing frozen one-word labels.
  const encryptPhrase = useWorkingPhrase(busy === 'export', 'encrypt');
  const decryptPhrase = useWorkingPhrase(busy === 'import', 'decrypt');
  const restorePhrase = useWorkingPhrase(busy === 'restore', 'restore');
  const syncPhrase = useWorkingPhrase(busy === 'sync-out', 'sync');
  const [recent, setRecent] = useState<RecentBackup[]>([]);

  // Pending import (decrypted but not yet applied).
  const [pending, setPending] = useState<{ payload: BackupPayload; location: string } | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');
  const [lastSummary, setLastSummary] = useState<RestoreSummary | null>(null);

  // Folder sync.
  const [syncFolder, setSyncFolder] = useState<string | null>(null);
  const [folderFiles, setFolderFiles] = useState<FolderBackupEntry[]>([]);

  const refreshRecent = useCallback(() => setRecent(getRecentBackups()), []);
  useEffect(() => { refreshRecent(); }, [refreshRecent]);

  const strongEnough = passphrase.length > 0 && passphraseAcceptable(passphrase);
  const weakWarn = passphrase.length > 0 && !strongEnough;

  // ---- actions -----------------------------------------------------------

  const onExport = useCallback(async () => {
    if (!passphrase) { toast('warning', 'Enter a passphrase first.'); return; }
    setBusy('export');
    try {
      const res = await exportEncrypted(passphrase);
      if (res.success) {
        toast('success', `Encrypted backup saved (${res.keyCount} keys).`);
        refreshRecent();
      } else if (res.error && res.error !== 'Save cancelled.') {
        toast('error', res.error);
      }
    } catch (err: any) {
      toast('error', err?.message || 'Export failed.');
    } finally {
      setBusy(null);
    }
  }, [passphrase, refreshRecent]);

  const onPickImport = useCallback(async () => {
    if (!passphrase) { toast('warning', 'Enter the backup passphrase first.'); return; }
    setBusy('import');
    try {
      const picked = await pickBackupFile();
      if (!picked) { setBusy(null); return; }
      const payload = await importEncrypted(picked.text, passphrase);
      setPending({ payload, location: picked.location });
      setLastSummary(null);
      toast('info', `Backup unlocked — ${payload.keyCount} keys ready to restore.`);
    } catch (err: any) {
      setPending(null);
      toast('error', err?.message || 'Could not open the backup.');
    } finally {
      setBusy(null);
    }
  }, [passphrase]);

  const onConfirmRestore = useCallback(() => {
    if (!pending) return;
    setBusy('restore');
    try {
      const summary = restore(pending.payload, restoreMode);
      setLastSummary(summary);
      setPending(null);
      refreshRecent();
      if (summary.failed > 0) {
        toast('warning', `Restored with ${summary.failed} skipped. Reload to see all changes.`);
      } else {
        toast('success', `Restore complete (+${summary.added} new, ${summary.updated} updated). Reload to apply.`);
      }
    } catch (err: any) {
      toast('error', err?.message || 'Restore failed.');
    } finally {
      setBusy(null);
    }
  }, [pending, restoreMode, refreshRecent]);

  const onChooseFolder = useCallback(async () => {
    setBusy('folder');
    try {
      const folder = await pickSyncFolder();
      if (!folder) { setBusy(null); return; }
      setSyncFolder(folder);
      setFolderFiles(await listFolderBackups(folder));
    } catch (err: any) {
      toast('error', err?.message || 'Could not open the folder.');
    } finally {
      setBusy(null);
    }
  }, []);

  const onSyncOut = useCallback(async () => {
    if (!syncFolder) return;
    if (!passphrase) { toast('warning', 'Enter a passphrase first.'); return; }
    setBusy('sync-out');
    try {
      const res = await syncOutToFolder(syncFolder, passphrase);
      if (res.success) {
        toast('success', 'Backup written to sync folder.');
        setFolderFiles(await listFolderBackups(syncFolder));
        refreshRecent();
      } else {
        toast('error', res.error || 'Sync failed.');
      }
    } catch (err: any) {
      toast('error', err?.message || 'Sync failed.');
    } finally {
      setBusy(null);
    }
  }, [syncFolder, passphrase, refreshRecent]);

  const onSyncIn = useCallback(async (entry: FolderBackupEntry) => {
    if (!passphrase) { toast('warning', 'Enter the backup passphrase first.'); return; }
    setBusy('sync-in');
    try {
      const payload = await syncInFromFile(entry.path, passphrase);
      setPending({ payload, location: entry.name });
      setLastSummary(null);
      refreshRecent();
      toast('info', `${entry.name} unlocked — ${payload.keyCount} keys ready.`);
    } catch (err: any) {
      toast('error', err?.message || 'Could not read the backup.');
    } finally {
      setBusy(null);
    }
  }, [passphrase, refreshRecent]);

  const onClearRecent = useCallback(() => {
    clearRecentBackups();
    refreshRecent();
  }, [refreshRecent]);

  // ---- render ------------------------------------------------------------

  return (
    <div style={styles.container} role="region" aria-label="Backup and Sync">
      <style>{`
        .bks-btn:hover:not(:disabled) { filter: brightness(1.12); }
        .bks-btn:active:not(:disabled) { transform: scale(0.985); }
        .bks-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .bks-row:hover { border-color: var(--color-border, rgba(255,255,255,0.15)) !important; }
        .bks-seg:hover { background: var(--color-bg-hover) !important; }
      `}</style>

      <div style={styles.header}>
        <h1 style={styles.title}>Backup &amp; Sync</h1>
        <span style={styles.envBadge}>{native ? 'Local files' : 'Browser download'}</span>
      </div>

      <div style={styles.main}>
        {/* Passphrase */}
        <section className="dex-liquid-glass-strong" style={styles.card}>
          <div style={styles.cardLabel}>Passphrase</div>
          <p style={styles.help}>
            Your backup is encrypted with AES-256. There is no recovery — if you lose this
            passphrase, the backup cannot be opened.
          </p>
          <div style={styles.passRow}>
            <input
              type={showPass ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter a strong passphrase"
              autoComplete="new-password"
              spellCheck={false}
              style={styles.input}
              aria-label="Backup passphrase"
            />
            <button
              className="bks-btn"
              style={styles.ghostBtn}
              onClick={() => setShowPass((s) => !s)}
              aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
            >
              {showPass ? 'Hide' : 'Show'}
            </button>
          </div>
          {weakWarn && (
            <div style={{ ...styles.note, color: 'var(--color-warning, #ffb340)' }}>
              Weak passphrase — use 12+ characters with mixed case, digits, and symbols.
            </div>
          )}
          {strongEnough && (
            <div style={{ ...styles.note, color: 'var(--color-success, #34c759)' }}>
              Passphrase strength is good.
            </div>
          )}
        </section>

        {/* Export */}
        <section className="dex-liquid-glass-strong" style={styles.card}>
          <div style={styles.cardLabel}>Export</div>
          <p style={styles.help}>
            Encrypt every DEX setting, note, board, and app state into a single
            <code style={styles.code}>.dexbackup</code> file.
          </p>
          <button
            className="bks-btn"
            style={styles.primaryBtn}
            disabled={busy !== null || !passphrase}
            onClick={onExport}
          >
            {busy === 'export' ? `${encryptPhrase}…` : 'Export encrypted backup'}
          </button>
        </section>

        {/* Import & restore */}
        <section className="dex-liquid-glass-strong" style={styles.card}>
          <div style={styles.cardLabel}>Import &amp; restore</div>
          <p style={styles.help}>
            Open a <code style={styles.code}>.dexbackup</code> file, then choose how to apply it.
          </p>
          <button
            className="bks-btn"
            style={styles.secondaryBtn}
            disabled={busy !== null || !passphrase}
            onClick={onPickImport}
          >
            {busy === 'import' ? `${decryptPhrase}…` : 'Choose backup file…'}
          </button>

          {pending && (
            <div className="dex-liquid-glass-strong" style={styles.pendingBox}>
              <div style={styles.pendingTitle}>
                Ready to restore: <strong>{pending.location}</strong>
              </div>
              <div style={styles.pendingMeta}>
                {pending.payload.keyCount} keys · created {formatWhen(pending.payload.createdAt)} ·
                app v{pending.payload.appVersion}
              </div>

              <SegmentedControl
                aria-label="Restore mode"
                size="md"
                fill
                options={[{ value: 'merge', label: 'Merge (keep newer)' }, { value: 'replace', label: 'Replace (overwrite)' }] as { value: RestoreMode; label: string }[]}
                value={restoreMode}
                onChange={(m) => setRestoreMode(m)}
                style={{ marginBottom: 6 }}
              />
              <p style={styles.segHelp}>
                {restoreMode === 'merge'
                  ? 'Per key, keeps whichever value is newer. Local data not in the backup is left alone.'
                  : 'Overwrites local values with the backup. Local-only keys are left alone.'}
              </p>

              <div style={styles.pendingActions}>
                <button
                  className="bks-btn"
                  style={styles.primaryBtn}
                  disabled={busy !== null}
                  onClick={onConfirmRestore}
                >
                  {busy === 'restore' ? `${restorePhrase}…` : `Restore (${restoreMode})`}
                </button>
                <button
                  className="bks-btn"
                  style={styles.ghostBtn}
                  disabled={busy !== null}
                  onClick={() => setPending(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {lastSummary && (
            <div className="dex-liquid-glass-strong" style={styles.summaryBox}>
              <div style={styles.summaryTitle}>Last restore ({lastSummary.mode})</div>
              <div style={styles.summaryGrid}>
                <Stat label="Added" value={lastSummary.added} />
                <Stat label="Updated" value={lastSummary.updated} />
                <Stat label="Kept local" value={lastSummary.keptLocal} />
                <Stat label="Unchanged" value={lastSummary.unchanged} />
                {lastSummary.failed > 0 && <Stat label="Failed" value={lastSummary.failed} danger />}
              </div>
              {lastSummary.errors.length > 0 && (
                <ul style={styles.errList}>
                  {lastSummary.errors.slice(0, 6).map((e, i) => (
                    <li key={i} style={styles.errItem}>{e}</li>
                  ))}
                </ul>
              )}
              <div style={styles.reloadNote}>Reload DEX for restored data to take effect everywhere.</div>
            </div>
          )}
        </section>

        {/* Offline folder sync */}
        {native && (
          <section className="dex-liquid-glass-strong" style={styles.card}>
            <div style={styles.cardLabel}>Offline folder sync</div>
            <p style={styles.help}>
              Point at a folder (e.g. a synced cloud-drive folder) to write and read
              encrypted backups there.
            </p>
            <div style={styles.passRow}>
              <button
                className="bks-btn"
                style={styles.secondaryBtn}
                disabled={busy !== null}
                onClick={onChooseFolder}
              >
                {syncFolder ? 'Change folder…' : 'Choose sync folder…'}
              </button>
              {syncFolder && (
                <button
                  className="bks-btn"
                  style={styles.primaryBtn}
                  disabled={busy !== null || !passphrase}
                  onClick={onSyncOut}
                >
                  {busy === 'sync-out' ? `${syncPhrase}…` : 'Sync out now'}
                </button>
              )}
            </div>
            {syncFolder && (
              <div style={styles.folderPath} title={syncFolder}>{syncFolder}</div>
            )}
            {syncFolder && (
              folderFiles.length === 0 ? (
                <div style={styles.empty}>No backups in this folder yet.</div>
              ) : (
                <div style={styles.list}>
                  {folderFiles.map((f) => (
                    <div key={f.path} className="bks-row dex-liquid-glass" style={styles.row}>
                      <span style={styles.rowName} title={f.path}>{f.name}</span>
                      <button
                        className="bks-btn"
                        style={styles.miniBtn}
                        disabled={busy !== null || !passphrase}
                        onClick={() => onSyncIn(f)}
                      >
                        Restore from this
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </section>
        )}

        {/* Recent backups */}
        <section className="dex-liquid-glass-strong" style={styles.card}>
          <div style={styles.cardHeaderRow}>
            <div style={styles.cardLabel}>Recent activity</div>
            {recent.length > 0 && (
              <button className="bks-btn" style={styles.linkBtn} onClick={onClearRecent}>
                Clear
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <div style={styles.empty}>No backups yet.</div>
          ) : (
            <div style={styles.list}>
              {recent.map((r) => (
                <div key={r.id} className="bks-row dex-liquid-glass" style={styles.row}>
                  <div style={{ minWidth: 0 }}>
                    <div style={styles.rowName}>
                      {KIND_LABEL[r.kind]} · {r.keyCount} keys
                    </div>
                    <div style={styles.rowSub} title={r.location}>
                      {formatWhen(r.at)}{r.location ? ` · ${r.location}` : ''}{r.note ? ` · ${r.note}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; danger?: boolean }> = ({ label, value, danger }) => (
  <div style={styles.stat}>
    <div style={{ ...styles.statValue, color: danger ? 'var(--color-error, #ff453a)' : 'var(--color-text-primary)' }}>
      {value}
    </div>
    <div style={styles.statLabel}>{label}</div>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--dex-font-ui)',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    height: 'var(--app-header-height, 44px)',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-solid, #1C1C1E)',
    flexShrink: 0,
  },
  title: { fontSize: '14px', fontWeight: 600, margin: 0, letterSpacing: '-0.2px' },
  envBadge: {
    fontSize: '11px',
    color: 'var(--color-text-tertiary)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 8px',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    maxWidth: '720px',
    width: '100%',
    margin: '0 auto',
  },
  card: {
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    boxShadow: 'var(--shadow-sm)',
  },
  cardHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: '0.4px',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-2)',
  },
  help: { fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-text-secondary)', margin: '0 0 var(--space-3) 0' },
  code: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11.5px',
    background: 'var(--color-bg-surface)',
    padding: '1px 5px',
    borderRadius: 'var(--radius-sm)',
    margin: '0 3px',
  },
  passRow: { display: 'flex', gap: 'var(--space-2)', alignItems: 'center' },
  input: {
    flex: 1,
    height: '34px',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-primary)',
    padding: '0 var(--space-3)',
    fontSize: '13px',
    fontFamily: 'var(--dex-font-ui)',
    outline: 'none',
  },
  note: { fontSize: '11.5px', marginTop: 'var(--space-2)' },
  primaryBtn: {
    height: '34px',
    padding: '0 var(--space-4)',
    background: 'var(--color-accent-fill)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  secondaryBtn: {
    height: '34px',
    padding: '0 var(--space-4)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  ghostBtn: {
    height: '34px',
    padding: '0 var(--space-3)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12.5px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  miniBtn: {
    height: '28px',
    padding: '0 var(--space-3)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-tertiary)',
    fontSize: '12px',
    cursor: 'pointer',
    padding: 0,
  },
  pendingBox: {
    marginTop: 'var(--space-3)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
  },
  pendingTitle: { fontSize: '13px', marginBottom: '4px' },
  pendingMeta: { fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-3)' },
  segRow: { display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' },
  seg: {
    flex: 1,
    height: '32px',
    background: 'var(--color-bg-secondary)',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12.5px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  segActive: {
    background: 'var(--color-accent-fill)',
    color: '#fff',
    borderColor: 'var(--color-accent)',
    fontWeight: 600,
  },
  segHelp: { fontSize: '11.5px', color: 'var(--color-text-tertiary)', margin: '0 0 var(--space-3) 0', lineHeight: 1.45 },
  pendingActions: { display: 'flex', gap: 'var(--space-2)' },
  summaryBox: {
    marginTop: 'var(--space-3)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
  },
  summaryTitle: { fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' },
  summaryGrid: { display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' },
  stat: { textAlign: 'center', minWidth: '54px' },
  statValue: { fontSize: '18px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  statLabel: { fontSize: '10.5px', color: 'var(--color-text-tertiary)', textTransform: 'none', letterSpacing: '0.3px' },
  errList: { margin: 'var(--space-2) 0 0 0', padding: '0 0 0 var(--space-4)' },
  errItem: { fontSize: '11.5px', color: 'var(--color-error, #ff453a)', lineHeight: 1.5 },
  reloadNote: { fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)' },
  folderPath: {
    fontSize: '11.5px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-tertiary)',
    marginTop: 'var(--space-2)',
    wordBreak: 'break-all',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    transition: 'all 0.15s ease',
  },
  rowName: { fontSize: '12.5px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowSub: { fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  empty: { fontSize: '12.5px', color: 'var(--color-text-tertiary)', padding: 'var(--space-3) 0' },
};

export default BackupSync;
