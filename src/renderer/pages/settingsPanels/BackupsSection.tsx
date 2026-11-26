// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Settings › Storage › Backups: your DEX database, settings and app data in one
// checked file (see src-tauri/src/backup_extras.rs). The native side snapshots
// safely (VACUUM INTO + SHA-256), verifies before restoring, takes a safety
// backup first and prunes to the kept count. DEX Ledger keeps its own backups.

import React, { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToastHelpers } from '../../components/Toast';
import { DexSwitch } from '../../components/controls/Switch';
import { formatBytes } from './StoragePanel';
import { syncInterfaceState, applyRestoredStateAndReload } from '../../services/dataBackup';

interface BackupRecord { id: string; filename: string; filepath: string; size_bytes: number; type: string; description: string; created_at: string }
interface BackupSettings { auto_enabled: boolean; interval_hours: number; max_backups: number; last_auto_backup: string | null; backup_path?: string }

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;
const nativeInvoke = (): Invoke | null => (window as unknown as { dex?: { invoke?: Invoke } }).dex?.invoke ?? null;

const KEEP_CHOICES = [3, 5, 10, 20];
const TYPE_LABEL: Record<string, string> = { manual: 'Manual', automatic: 'Automatic', pre_restore: 'Before a restore' };

/** SQLite `datetime('now')` is UTC without a zone marker. */
function when(created: string): string {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(created) ? created : created.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? created : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function BackupsSection({ styles }: { styles: Record<string, React.CSSProperties> }) {
  const invoke = nativeInvoke();
  const [backups, setBackups] = useState<BackupRecord[] | null>(null);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, ConfirmHost } = useConfirm();
  const toast = useToastHelpers();

  const refresh = useCallback(async () => {
    if (!invoke) return;
    const [list, s] = await Promise.all([
      invoke('backup:list').catch(() => []),
      invoke('backup:get-settings').catch(() => null),
    ]);
    setBackups(Array.isArray(list) ? list as BackupRecord[] : []);
    setSettings(s as BackupSettings | null);
  }, [invoke]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!invoke) {
    return (
      <>
        <h3 style={styles.sectionTitle}>Backups</h3>
        <div style={styles.settingDesc}>Backups of your DEX data are made in the desktop app.</div>
      </>
    );
  }

  const updateSettings = async (partial: Partial<BackupSettings>) => {
    const next = await invoke('backup:update-settings', partial).catch(() => null);
    if (next) setSettings(next as BackupSettings);
  };

  const backUpNow = async () => {
    setBusy('create');
    const complete = await syncInterfaceState();
    const res = await invoke('backup:create', 'manual', 'Backed up from Settings').catch(() => null) as { id?: string; error?: string } | null;
    setBusy(null);
    if (res?.id && complete) toast.success('Backup made.');
    else if (res?.id) toast.warning('Backup made, but the latest settings could not be added.');
    else toast.error(`Couldn't back up${res?.error ? `: ${res.error}` : ''}.`);
    void refresh();
  };

  const restore = async (b: BackupRecord) => {
    const ok = await confirm({
      title: 'Restore this backup?',
      tone: 'destructive',
      confirmLabel: 'Restore',
      message: `Your DEX data and settings go back to ${when(b.created_at)}. What you have now is backed up first, so this can be undone. DEX reloads when it finishes.`,
    });
    if (!ok) return;
    setBusy(b.id);
    const check = await invoke('backup:verify', b.id).catch(() => null) as { valid?: boolean; details?: string } | null;
    if (!check?.valid) {
      setBusy(null);
      toast.error(`This backup can't be used: ${check?.details ?? 'it could not be checked'}. Nothing was changed.`);
      return;
    }
    // So the safety backup holds what is on screen now.
    await syncInterfaceState();
    const res = await invoke('backup:restore', b.id).catch(() => null) as { success?: boolean; errors?: string[] } | null;
    if (res?.success) { await applyRestoredStateAndReload(); return; }
    setBusy(null);
    toast.error(`Restore failed: ${res?.errors?.join(', ') || 'unknown error'}`);
    void refresh();
  };

  const remove = async (b: BackupRecord) => {
    const ok = await confirm({
      title: 'Delete this backup?',
      tone: 'destructive',
      confirmLabel: 'Delete',
      message: `The backup from ${when(b.created_at)} (${formatBytes(b.size_bytes)}) is removed from this computer.`,
    });
    if (!ok) return;
    await invoke('backup:delete', b.id).catch(() => null);
    void refresh();
  };

  const chooseFolder = async () => {
    const picked = await invoke('dialog:showOpenDialog', { title: 'Choose a backup folder', properties: ['openDirectory', 'createDirectory'] })
      .catch(() => null) as { canceled?: boolean; filePaths?: string[] } | null;
    const folder = picked?.canceled ? undefined : picked?.filePaths?.[0];
    if (folder) await updateSettings({ backup_path: folder });
  };

  const total = (backups ?? []).reduce((n, b) => n + (b.size_bytes || 0), 0);
  const small: React.CSSProperties = { ...styles.secondaryBtn, marginTop: 0, padding: '4px 10px', fontSize: 12 };

  return (
    <>
      <h3 style={styles.sectionTitle}>Backups</h3>
      <div className="settings-row" style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Back up now</span>
          <span style={styles.settingDesc}>
            Your DEX data and settings in one file. Passwords, API keys and Ledger are not included.{backups?.length ? ` ${backups.length} kept, ${formatBytes(total)}.` : ''}
          </span>
        </div>
        <button type="button" style={styles.secondaryBtn} onClick={() => void backUpNow()} disabled={busy !== null}>
          {busy === 'create' ? 'Backing up…' : 'Back Up Now'}
        </button>
      </div>
      {settings && (
        <>
          <div className="settings-row" style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Automatic backups</span>
              <span style={styles.settingDesc}>
                Once a day.{settings.last_auto_backup ? ` Last: ${when(settings.last_auto_backup)}.` : ''}
              </span>
            </div>
            <DexSwitch checked={settings.auto_enabled} label="Automatic backups" onChange={on => void updateSettings({ auto_enabled: on })} />
          </div>
          <div className="settings-row" style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Backup folder</span>
              <span style={{ ...styles.settingDesc, overflowWrap: 'anywhere' }}>
                {settings.backup_path || 'Inside DEX’s data folder. Choose another drive to survive a disk failure.'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {settings.backup_path && (
                <button type="button" style={small} onClick={() => void updateSettings({ backup_path: '' })}>Use default</button>
              )}
              <button type="button" style={small} onClick={() => void chooseFolder()}>Choose…</button>
            </div>
          </div>
          <div className="settings-row" style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Keep</span>
              <span style={styles.settingDesc}>Older backups are removed to save space.</span>
            </div>
            <select
              aria-label="Backups to keep"
              value={KEEP_CHOICES.includes(settings.max_backups) ? settings.max_backups : 10}
              onChange={e => void updateSettings({ max_backups: Number(e.target.value) })}
              style={styles.secondaryBtn}
            >
              {KEEP_CHOICES.map(n => <option key={n} value={n}>{n} backups</option>)}
            </select>
          </div>
        </>
      )}
      {backups && backups.length > 0 && (
        <div style={styles.aboutDetails} role="list" aria-label="Backups">
          {backups.map(b => (
            <div key={b.id} style={{ ...styles.aboutRow, alignItems: 'center', gap: 8 }} role="listitem">
              <span style={{ ...styles.aboutLabel, flex: 1 }}>
                {when(b.created_at)}
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {TYPE_LABEL[b.type] ?? b.type} · {formatBytes(b.size_bytes)}
                </span>
              </span>
              <button type="button" style={small} disabled={busy !== null} onClick={() => void restore(b)}>
                {busy === b.id ? 'Restoring…' : 'Restore'}
              </button>
              <button type="button" style={small} disabled={busy !== null} onClick={() => void remove(b)} aria-label={`Delete the backup from ${when(b.created_at)}`}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      <ConfirmHost />
    </>
  );
}
