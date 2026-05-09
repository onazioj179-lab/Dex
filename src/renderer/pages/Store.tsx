// =============================================================================
// DEX Platform — Phase 4 renderer: Store
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Minimal Store browser. Lists catalog entries from the AppStoreService
 * and lets the user install / uninstall. Real catalog fetch + rich UI
 * follow in a later pass.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DexIcon from '../components/DexIcon';
import {
  premiumGlassCard,
  premiumGlassPanel,
  premiumGlassToolbar,
} from '../styles/glassMenu';
import type { CatalogEntry, InstalledApp, PlanResult } from '../../shared/store/catalog';
import type { InstallResult } from '../../shared/store/installer';

type IpcBridge = { invoke: (c: string, ...a: any[]) => Promise<any> };

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 160,
  maxWidth: 340,
  padding: '8px 10px 8px 32px',
  background: 'rgba(0,0,0,0.28)',
  border: '1px solid var(--pg-border-strong)',
  borderRadius: 8,
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontSize: 13,
  boxSizing: 'border-box',
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Size pending';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
};

const ipc = (): IpcBridge => {
  const w = window as any;
  const bridge = w.dexAPI ?? w.electronAPI ?? w.electron;
  if (!bridge?.invoke) throw new Error('DEX IPC bridge is unavailable');
  return bridge;
};

const toMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export default function Store(): React.ReactElement {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<string>('');
  const [query, setQuery] = useState('');
  const [installedOnly, setInstalledOnly] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([
        ipc().invoke('store:list'),
        ipc().invoke('store:installed'),
      ]);
      setCatalog(Array.isArray(c) ? c : []);
      setInstalled(Array.isArray(i) ? i : []);
    } catch (e) {
      setLast(`Refresh failed: ${toMessage(e)}`);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const isInstalled = useCallback((id: string) => installed.some(a => a.packageId === id), [installed]);
  const installedIds = useMemo(() => new Set(installed.map(a => a.packageId)), [installed]);
  const visibleCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(entry => {
      const id = entry.manifest.packageId;
      if (installedOnly && !installedIds.has(id)) return false;
      if (!q) return true;
      const haystack = `${id} ${entry.manifest.name} ${entry.manifest.description ?? ''} ${entry.manifest.categories.join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [catalog, installedIds, installedOnly, query]);

  const onInstall = useCallback(async (id: string) => {
    setBusy(id);
    setLast('');
    try {
      const r = (await ipc().invoke('store:install', id)) as InstallResult;
      setLast(r.ok ? `Installed ${r.packageId} ${r.version ?? ''}`.trim() : `Install failed: ${r.error}`);
      await refresh();
    } catch (e) {
      setLast(`Error: ${toMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const onUninstall = useCallback(async (id: string) => {
    setBusy(id);
    setLast('');
    try {
      const ok = await ipc().invoke('store:uninstall', id);
      setLast(ok ? `Removed ${id}` : `Not installed: ${id}`);
      await refresh();
    } catch (e) {
      setLast(`Error: ${toMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const onPlan = useCallback(async (id: string) => {
    try {
      const p = (await ipc().invoke('store:plan', id)) as PlanResult | null;
      if (!p) { setLast(`No plan for ${id}`); return; }
      if (!p.ok) { setLast(`Plan blocked: ${p.reason}`); return; }
      setLast(`Plan ${p.pathway}: ${p.steps.length} steps`);
    } catch (e) {
      setLast(`Error: ${toMessage(e)}`);
    }
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.storeIcon} aria-hidden><DexIcon name="package" size={18} /></div>
          <div style={{ minWidth: 0 }}>
            <h1 style={styles.title}>DEX Store</h1>
            <div style={styles.subtitle}>{visibleCatalog.length} shown - {installed.length} installed</div>
          </div>
        </div>

        <div style={styles.controls}>
          <label style={styles.searchWrap}>
            <span style={styles.searchIcon} aria-hidden><DexIcon name="search" size={14} /></span>
            <input
              aria-label="Search store catalog"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search catalog"
              style={inputStyle}
            />
          </label>
          <label style={styles.filterPill}>
            <input
              type="checkbox"
              checked={installedOnly}
              onChange={(event) => setInstalledOnly(event.target.checked)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <DexIcon name="check-circle" size={14} />
            <span>Installed</span>
          </label>
          <button style={buttonStyle('muted')} onClick={refresh} disabled={busy !== null} title="Refresh catalog">
            <DexIcon name="refresh" size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {last && (
        <div style={styles.status} role="status" aria-live="polite">
          <DexIcon name={last.toLowerCase().includes('failed') || last.toLowerCase().startsWith('error') ? 'alert-triangle' : 'info'} size={14} />
          <span>{last}</span>
        </div>
      )}

      {catalog.length === 0 ? (
        <div style={styles.emptyState}>
          <DexIcon name="inbox" size={28} />
          <span>Catalog is empty. Drop a catalog.json into the store dir or fetch from a registry.</span>
        </div>
      ) : visibleCatalog.length === 0 ? (
        <div style={styles.emptyState}>
          <DexIcon name="filter" size={28} />
          <span>No catalog entries match the current filters.</span>
        </div>
      ) : (
        <ul style={styles.catalogList}>
          {visibleCatalog.map(entry => {
            const id = entry.manifest.packageId;
            const name = entry.manifest.name ?? id;
            const installedEntry = installedIds.has(id);
            return (
              <li key={id} style={styles.catalogRow}>
                <div style={styles.appGlyph} aria-hidden><DexIcon name="package" size={18} /></div>
                <div style={styles.rowContent}>
                  <div style={styles.rowTopLine}>
                    <span style={styles.appName}>{name}</span>
                    {installedEntry && <span style={styles.installedBadge}>Installed</span>}
                  </div>
                  <div style={styles.appMeta}>
                    <span>{id}</span>
                    <span>v{entry.manifest.packageVersion}</span>
                    <span>{formatBytes(entry.bundleBytes)}</span>
                    <span>{entry.manifest.contentRating}</span>
                    {entry.reviewSummary && <span>{entry.reviewSummary.avg.toFixed(1)} rating</span>}
                  </div>
                  {entry.manifest.description && <div style={styles.appDescription}>{entry.manifest.description}</div>}
                  <div style={styles.categoryRow}>
                    {entry.manifest.categories.slice(0, 4).map(category => <span key={category} style={styles.categoryPill}>{category}</span>)}
                  </div>
                </div>

                <div style={styles.actionGroup}>
                  <button style={buttonStyle('muted')} disabled={busy !== null} onClick={() => onPlan(id)} title="Show install plan">
                    <DexIcon name="clipboard" size={14} />
                    <span>Plan</span>
                  </button>
                  {installedEntry ? (
                    <button
                      style={buttonStyle('danger')}
                      disabled={busy !== null}
                      onClick={() => onUninstall(id)}
                      title={`Uninstall ${name}`}
                    >
                      <DexIcon name="trash" size={14} />
                      <span>{busy === id ? 'Removing...' : 'Uninstall'}</span>
                    </button>
                  ) : (
                    <button
                      style={buttonStyle('accent')}
                      disabled={busy !== null}
                      onClick={() => onInstall(id)}
                      title={`Install ${name}`}
                    >
                      <DexIcon name="download" size={14} />
                      <span>{busy === id ? 'Installing...' : 'Install'}</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    ...premiumGlassPanel,
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
  },
  header: {
    ...premiumGlassToolbar,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
  },
  titleBlock: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  storeIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--color-accent)',
    background: 'rgba(10,132,255,0.14)',
    border: '1px solid rgba(10,132,255,0.28)',
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.15 },
  subtitle: { marginTop: 2, fontSize: 12, color: 'var(--color-text-secondary)' },
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%',
    overflowX: 'auto',
    overflowY: 'visible',
    scrollbarWidth: 'thin',
  },
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center', minWidth: 180, flex: '1 1 260px' },
  searchIcon: { position: 'absolute', left: 10, display: 'flex', color: 'var(--color-text-tertiary)', pointerEvents: 'none' },
  filterPill: {
    minHeight: 34,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '0 10px',
    border: '1px solid var(--pg-border-strong)',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '12px 16px 0',
    padding: '10px 12px',
    border: '1px solid var(--pg-border)',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    overflowWrap: 'anywhere',
  },
  emptyState: {
    ...premiumGlassCard,
    margin: 16,
    padding: 24,
    minHeight: 160,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
  },
  catalogList: {
    listStyle: 'none',
    margin: 0,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    overflowY: 'auto',
    overflowX: 'hidden',
    minHeight: 0,
    flex: 1,
  },
  catalogRow: {
    ...premiumGlassCard,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  appGlyph: {
    width: 38,
    height: 38,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--color-accent)',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--pg-border)',
  },
  rowContent: { flex: '1 1 280px', minWidth: 0 },
  rowTopLine: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  appName: { fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  installedBadge: {
    padding: '2px 7px',
    borderRadius: 999,
    background: 'rgba(48,209,88,0.12)',
    border: '1px solid rgba(48,209,88,0.28)',
    color: 'var(--color-success)',
    fontSize: 10.5,
    fontWeight: 700,
    flexShrink: 0,
  },
  appMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 10px',
    marginTop: 4,
    color: 'var(--color-text-tertiary)',
    fontSize: 11,
  },
  appDescription: {
    marginTop: 6,
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    lineHeight: 1.4,
    overflowWrap: 'anywhere',
  },
  categoryRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  categoryPill: {
    padding: '2px 7px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--pg-border)',
    color: 'var(--color-text-secondary)',
    fontSize: 10.5,
    textTransform: 'capitalize',
  },
  actionGroup: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flex: '0 1 auto',
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'thin',
  },
};

const buttonStyle = (variant: 'accent' | 'muted' | 'danger'): React.CSSProperties => {
  const base: React.CSSProperties = {
    minHeight: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid var(--pg-border-strong)',
    color: 'var(--color-text-primary)',
    background: 'rgba(255,255,255,0.04)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
  if (variant === 'accent') return { ...base, background: 'var(--color-accent)', color: '#fff', borderColor: 'transparent' };
  if (variant === 'danger') return { ...base, background: 'rgba(255,69,58,0.14)', color: '#ff8a82', borderColor: 'rgba(255,69,58,0.36)' };
  return base;
};
