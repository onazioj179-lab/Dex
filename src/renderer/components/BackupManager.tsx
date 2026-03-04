/**
 * DEX Backup Manager
 * Create, restore, and manage application backups
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useMemo, memo, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface BackupEntry {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  sizeBytes: number;
  sections: string[];
  compressed: boolean;
  data: string; // Base64 encoded JSON
}

// ============================================================================
// STORAGE
// ============================================================================

const BACKUPS_KEY = 'dex-backups';
const MAX_BACKUPS = 10;

// All localStorage keys managed by DEX
const DEX_STORAGE_SECTIONS: { key: string; label: string }[] = [
  { key: 'dex-settings', label: 'Settings' },
  { key: 'dex-notes', label: 'Notes' },
  { key: 'dex-tasks', label: 'Tasks' },
  { key: 'dex-calendar', label: 'Calendar' },
  { key: 'dex-kanban', label: 'Kanban Board' },
  { key: 'dex-engagement', label: 'Engagement & XP' },
  { key: 'dex-analytics', label: 'Analytics' },
  { key: 'dex-challenges', label: 'Challenges' },
  { key: 'dex-clipboard', label: 'Clipboard History' },
  { key: 'dex-pinned-apps', label: 'Pinned Apps' },
  { key: 'dex-focus-mode', label: 'Focus Mode' },
  { key: 'dex-theme', label: 'Theme' },
  { key: 'dex-window-layout', label: 'Window Layout' },
  { key: 'dex-recent-actions', label: 'Recent Actions' },
  { key: 'dex-bookmarks', label: 'Bookmarks' },
  { key: 'dex-snippets', label: 'Snippets' },
  { key: 'dex-habits', label: 'Habits' },
  { key: 'dex-pomodoro', label: 'Pomodoro' },
  { key: 'dex-quick-notes', label: 'Quick Notes' },
  { key: 'dex-markdown-docs', label: 'Markdown Docs' },
];

function loadBackups(): BackupEntry[] {
  try {
    const raw = localStorage.getItem(BACKUPS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveBackups(backups: BackupEntry[]): void {
  // We limit stored backups to prevent localStorage overflow
  const limited = backups.slice(0, MAX_BACKUPS);
  try { localStorage.setItem(BACKUPS_KEY, JSON.stringify(limited)); } catch {}
}

// ============================================================================
// BACKUP LOGIC
// ============================================================================

function createBackupData(sectionKeys: string[]): { data: string; sizeBytes: number } {
  const payload: Record<string, any> = {};
  for (const key of sectionKeys) {
    const val = localStorage.getItem(key);
    if (val !== null) payload[key] = val;
  }
  const json = JSON.stringify(payload);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return { data: encoded, sizeBytes: encoded.length };
}

function restoreBackupData(data: string): number {
  try {
    const json = decodeURIComponent(escape(atob(data)));
    const payload = JSON.parse(json);
    let count = 0;
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string') {
        localStorage.setItem(key, value);
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const BackupManager: React.FC = memo(() => {
  const [backups, setBackups] = useState<BackupEntry[]>(loadBackups);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set(DEX_STORAGE_SECTIONS.map(s => s.key)));
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const persist = useCallback((b: BackupEntry[]) => { setBackups(b); saveBackups(b); }, []);

  const toggleSection = useCallback((key: string) => {
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelectedSections(new Set(DEX_STORAGE_SECTIONS.map(s => s.key))), []);
  const selectNone = useCallback(() => setSelectedSections(new Set()), []);

  const createBackup = useCallback(() => {
    if (selectedSections.size === 0) return;
    const keys = Array.from(selectedSections);
    const { data, sizeBytes } = createBackupData(keys);
    const entry: BackupEntry = {
      id: `backup-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: name.trim() || `Backup ${new Date().toLocaleDateString()}`,
      description: desc.trim(),
      createdAt: Date.now(),
      sizeBytes,
      sections: keys,
      compressed: false,
      data,
    };
    persist([entry, ...backups]);
    setShowCreate(false);
    setName('');
    setDesc('');
    setMessage('Backup created successfully');
    setTimeout(() => setMessage(''), 3000);
  }, [name, desc, selectedSections, backups, persist]);

  const restoreBackup = useCallback((id: string) => {
    const entry = backups.find(b => b.id === id);
    if (!entry) return;
    const count = restoreBackupData(entry.data);
    setRestoreConfirm(null);
    setMessage(`Restored ${count} data sections. Reload to see changes.`);
    setTimeout(() => setMessage(''), 5000);
  }, [backups]);

  const deleteBackup = useCallback((id: string) => {
    persist(backups.filter(b => b.id !== id));
  }, [backups, persist]);

  const exportBackup = useCallback((entry: BackupEntry) => {
    const json = JSON.stringify(entry, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dex-backup-${entry.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importBackup = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const entry = JSON.parse(reader.result as string) as BackupEntry;
        if (!entry.id || !entry.data || !entry.sections) throw new Error('Invalid backup format');
        entry.id = `backup-${Date.now()}-imported`;
        persist([entry, ...backups]);
        setMessage('Backup imported successfully');
        setTimeout(() => setMessage(''), 3000);
      } catch {
        setMessage('Error: Invalid backup file');
        setTimeout(() => setMessage(''), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [backups, persist]);

  const totalSize = useMemo(() => backups.reduce((sum, b) => sum + b.sizeBytes, 0), [backups]);

  return (
    <div style={styles.container}>
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileImport} />

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Backups</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {backups.length} backup{backups.length !== 1 ? 's' : ''} ({formatBytes(totalSize)})
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={importBackup} style={styles.secondaryBtn}>Import</button>
          <button onClick={() => setShowCreate(!showCreate)} style={styles.primaryBtn}>
            {showCreate ? 'Cancel' : '+ Create Backup'}
          </button>
        </div>
      </div>

      {message && <div style={styles.message}>{message}</div>}

      {/* Create form */}
      {showCreate && (
        <div style={styles.createForm}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Backup name (optional)"
            style={styles.input} aria-label="Backup name" />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)"
            style={styles.input} aria-label="Backup description" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Data to include:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={selectAll} style={styles.linkBtn}>Select all</button>
              <button onClick={selectNone} style={styles.linkBtn}>None</button>
            </div>
          </div>
          <div style={styles.sectionGrid}>
            {DEX_STORAGE_SECTIONS.map(s => {
              const hasData = localStorage.getItem(s.key) !== null;
              return (
                <label key={s.key} style={{ ...styles.sectionItem, opacity: hasData ? 1 : 0.4 }}>
                  <input type="checkbox" checked={selectedSections.has(s.key)} onChange={() => toggleSection(s.key)} />
                  <span style={{ fontSize: 11 }}>{s.label}</span>
                </label>
              );
            })}
          </div>
          <button onClick={createBackup} disabled={selectedSections.size === 0}
            style={{ ...styles.primaryBtn, width: '100%' }}>
            Create Backup ({selectedSections.size} sections)
          </button>
        </div>
      )}

      {/* Backup list */}
      <div style={styles.backupList}>
        {backups.length === 0 ? (
          <div style={styles.emptyState}>No backups yet. Create one to protect your data.</div>
        ) : (
          backups.map(b => (
            <div key={b.id} style={styles.backupCard}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.backupName}>{b.name}</div>
                {b.description && <div style={styles.backupDesc}>{b.description}</div>}
                <div style={styles.backupMeta}>
                  {formatDate(b.createdAt)} -- {formatBytes(b.sizeBytes)} -- {b.sections.length} sections -- {timeAgo(b.createdAt)}
                </div>
              </div>
              <div style={styles.backupActions}>
                {restoreConfirm === b.id ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>Confirm?</span>
                    <button onClick={() => restoreBackup(b.id)} style={{ ...styles.actionBtn, color: '#10b981' }}>Yes</button>
                    <button onClick={() => setRestoreConfirm(null)} style={styles.actionBtn}>No</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => setRestoreConfirm(b.id)} style={{ ...styles.actionBtn, color: '#10b981' }}>Restore</button>
                    <button onClick={() => exportBackup(b)} style={styles.actionBtn}>Export</button>
                    <button onClick={() => deleteBackup(b.id)} style={{ ...styles.actionBtn, color: '#ef4444' }}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

BackupManager.displayName = 'BackupManager';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  primaryBtn: { padding: '6px 14px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '6px 14px', borderRadius: 8, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', color: '#3b82f6', fontSize: 11, cursor: 'pointer' },
  message: { padding: '6px 12px', borderRadius: 6, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontSize: 12, fontWeight: 600 },
  createForm: { display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  input: { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, fontFamily: 'inherit', outline: 'none' },
  sectionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' },
  sectionItem: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  backupList: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  backupCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border, rgba(255,255,255,0.04))' },
  backupName: { fontSize: 13, fontWeight: 700 },
  backupDesc: { fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 },
  backupMeta: { fontSize: 10, color: 'var(--color-text-muted)', marginTop: 3 },
  backupActions: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  actionBtn: { fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' },
  emptyState: { textAlign: 'center', padding: 30, fontSize: 13, color: 'var(--color-text-muted)' },
};

export default BackupManager;
