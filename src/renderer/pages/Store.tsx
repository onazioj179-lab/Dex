// =============================================================================
// DEX Platform — Phase 3 renderer: Store
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * The DEX Store shell. Owns the catalog/installed/publisher data + the install,
 * uninstall, and plan actions, and switches between two surfaces:
 *   - StoreHome  — featured hero, category rails, search + installed grids,
 *   - AppDetail  — screenshots, "what this app can do", publisher card, reviews.
 * The Apple-style presentation lives in ./store/*; this file is the controller.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DexIcon from '../components/DexIcon';
import { premiumGlassPanel, premiumGlassToolbar } from '../styles/glassMenu';
import type { CatalogEntry, InstalledApp, PlanResult } from '../../shared/store/catalog';
import type { InstallResult } from '../../shared/store/installer';
import type { PublisherProfile } from '../../shared/store/publisher';
import StoreHome from './store/StoreHome';
import AppDetail from './store/AppDetail';
import DeveloperPanel from './store/DeveloperPanel';
import { ipc, toMessage } from './store/storeKit';

type View = { kind: 'home' } | { kind: 'detail'; packageId: string };

export default function Store(): React.ReactElement {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [publishers, setPublishers] = useState<PublisherProfile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState('');
  const [query, setQuery] = useState('');
  const [installedOnly, setInstalledOnly] = useState(false);
  const [view, setView] = useState<View>({ kind: 'home' });
  const [planText, setPlanText] = useState('');
  const [devOpen, setDevOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, i, p] = await Promise.all([
        ipc().invoke('store:list'),
        ipc().invoke('store:installed'),
        ipc().invoke('store:publisher:list').catch(() => []),
      ]);
      setCatalog(Array.isArray(c) ? c : []);
      setInstalled(Array.isArray(i) ? i : []);
      setPublishers(Array.isArray(p) ? p : []);
    } catch (e) {
      setLast(`Refresh failed: ${toMessage(e)}`);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const installedRecord = useCallback((id: string) => installed.find(a => a.packageId === id), [installed]);

  const detailEntry = useMemo(
    () => (view.kind === 'detail' ? catalog.find(e => e.manifest.packageId === view.packageId) : undefined),
    [view, catalog],
  );

  const openDetail = useCallback((packageId: string) => {
    setPlanText('');
    setLast('');
    setView({ kind: 'detail', packageId });
  }, []);

  const goHome = useCallback(() => setView({ kind: 'home' }), []);

  const onSearchChange = useCallback((value: string) => {
    setQuery(value);
    if (value.trim() && view.kind !== 'home') setView({ kind: 'home' });
  }, [view.kind]);

  const onInstall = useCallback(async (id: string) => {
    setBusy(id);
    setLast('');
    try {
      const r = (await ipc().invoke('store:install', id)) as InstallResult;
      setLast(r.ok ? `Installed ${r.packageId} ${r.version ?? ''}`.trim() : `Install failed: ${r.error}`);
      await refresh();
      if (r.ok) {
        try {
          const mod = await import('../uki/knowledgeFeeder');
          await mod.notifyAppInstalled({ packageId: r.packageId, version: r.version });
        } catch { /* feeder is non-critical */ }
        try {
          window.dispatchEvent(new CustomEvent('dex:app-installed', { detail: { packageId: r.packageId, version: r.version } }));
        } catch { /* ignore */ }
      }
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
      if (ok) {
        try {
          const mod = await import('../uki/knowledgeFeeder');
          await mod.notifyAppUninstalled(id);
        } catch { /* feeder is non-critical */ }
        try {
          window.dispatchEvent(new CustomEvent('dex:app-uninstalled', { detail: { packageId: id } }));
        } catch { /* ignore */ }
      }
    } catch (e) {
      setLast(`Error: ${toMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const onPlan = useCallback(async (id: string) => {
    setPlanText('');
    try {
      const p = (await ipc().invoke('store:plan', id)) as PlanResult | null;
      if (!p) { setPlanText(`No install plan available for ${id}.`); return; }
      if (!p.ok) { setPlanText(`Install blocked: ${p.reason}`); return; }
      setPlanText(p.pathway === 'skip'
        ? 'Already up to date — nothing to install.'
        : `Plan ready (${p.pathway}): ${p.steps.length} step${p.steps.length === 1 ? '' : 's'} including download, signature verification, and rollback safety.`);
    } catch (e) {
      setPlanText(`Error: ${toMessage(e)}`);
    }
  }, []);

  const inDetail = view.kind === 'detail';
  const statusIsError = last.toLowerCase().includes('failed') || last.toLowerCase().startsWith('error');

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          {inDetail ? (
            <button type="button" onClick={goHome} style={styles.backBtn} title="Back to store">
              <DexIcon name="arrow-left" size={16} />
              <span>Store</span>
            </button>
          ) : (
            <>
              <div style={styles.storeIcon} aria-hidden><DexIcon name="package" size={18} /></div>
              <div style={{ minWidth: 0 }}>
                <h1 style={styles.title}>DEX Store</h1>
                <div style={styles.subtitle}>{catalog.length} app{catalog.length === 1 ? '' : 's'} · {installed.length} installed</div>
              </div>
            </>
          )}
        </div>

        <div style={styles.controls}>
          <label style={styles.searchWrap}>
            <span style={styles.searchIcon} aria-hidden><DexIcon name="search" size={14} /></span>
            <input
              aria-label="Search the DEX Store"
              value={query}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search apps"
              style={inputStyle}
            />
          </label>
          {!inDetail && (
            <label style={styles.filterPill}>
              <input
                type="checkbox"
                checked={installedOnly}
                onChange={e => setInstalledOnly(e.target.checked)}
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <DexIcon name="check-circle" size={14} />
              <span>Installed</span>
            </label>
          )}
          <button type="button" style={styles.iconBtn} onClick={refresh} disabled={busy !== null} title="Refresh catalog">
            <DexIcon name="refresh" size={14} />
          </button>
          <button type="button" style={styles.iconBtn} onClick={() => setDevOpen(true)} title="Developer: install an app from a signed file">
            <DexIcon name="terminal" size={14} />
          </button>
        </div>
      </header>

      {last && (
        <div style={styles.status} role="status" aria-live="polite">
          <DexIcon name={statusIsError ? 'alert-triangle' : 'check-circle'} size={14} />
          <span>{last}</span>
        </div>
      )}

      {inDetail && detailEntry ? (
        <AppDetail
          entry={detailEntry}
          installedRecord={installedRecord(detailEntry.manifest.packageId)}
          publisher={publishers.find(p => p.id === detailEntry.publisherId)}
          busy={busy}
          planText={planText}
          onInstall={onInstall}
          onUninstall={onUninstall}
          onPlan={onPlan}
        />
      ) : inDetail ? (
        <div style={styles.missing}>
          <DexIcon name="x-circle" size={26} />
          <span>That app is no longer in the catalog.</span>
          <button type="button" style={styles.backBtn} onClick={goHome}><DexIcon name="arrow-left" size={14} /> Back to store</button>
        </div>
      ) : (
        <StoreHome
          catalog={catalog}
          installed={installed}
          publishers={publishers}
          query={query}
          installedOnly={installedOnly}
          busy={busy}
          onOpen={openDetail}
        />
      )}

      {devOpen && (
        <DeveloperPanel
          onClose={() => setDevOpen(false)}
          onInstalled={async (packageId) => {
            await refresh();
            setDevOpen(false);
            setLast(`Installed ${packageId} from file`);
            if (packageId) openDetail(packageId);
          }}
        />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 160,
  maxWidth: 340,
  padding: '8px 10px 8px 32px',
  background: 'rgba(0,0,0,0.28)',
  border: '1px solid var(--pg-border-strong)',
  borderRadius: 9,
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontSize: 13,
  boxSizing: 'border-box',
};

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
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    padding: '0 12px',
    borderRadius: 9,
    border: '1px solid var(--pg-border-strong)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
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
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center', minWidth: 180, flex: '1 1 240px' },
  searchIcon: { position: 'absolute', left: 10, display: 'flex', color: 'var(--color-text-tertiary)', pointerEvents: 'none' },
  filterPill: {
    minHeight: 34,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '0 10px',
    border: '1px solid var(--pg-border-strong)',
    borderRadius: 9,
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  iconBtn: {
    minHeight: 34,
    minWidth: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--pg-border-strong)',
    borderRadius: 9,
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '12px 16px 0',
    padding: '10px 12px',
    border: '1px solid var(--pg-border)',
    borderRadius: 9,
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    overflowWrap: 'anywhere',
  },
  missing: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--color-text-secondary)',
    padding: 24,
    textAlign: 'center',
  },
};
