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
import { glassPanel, glassButton } from '../styles/glassMenu';
import type { CatalogEntry, InstalledApp, PlanResult } from '../../shared/store/catalog';
import type { InstallResult } from '../../shared/store/installer';

type IpcBridge = { invoke: (c: string, ...a: any[]) => Promise<any> };

const rowStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
};

const inputStyle: React.CSSProperties = {
  ...rowStyle,
  minWidth: 220,
  padding: '8px 10px',
  color: 'var(--color-text-primary)',
  outline: 'none',
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
      return id.toLowerCase().includes(q) || entry.manifest.name.toLowerCase().includes(q);
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
    <div className="p-6 h-full overflow-auto" style={glassPanel}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">DEX Store</h1>
          <div className="text-xs opacity-70">{installed.length} installed</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            aria-label="Search store catalog"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search catalog"
            style={inputStyle}
          />
          <label className="flex items-center gap-2 text-sm opacity-85">
            <input
              type="checkbox"
              checked={installedOnly}
              onChange={(event) => setInstalledOnly(event.target.checked)}
            />
            Installed
          </label>
          <button style={glassButton} onClick={refresh} disabled={busy !== null}>Refresh</button>
        </div>
      </header>

      {last && (
        <div className="mb-3 text-sm opacity-80 break-words" role="status" aria-live="polite">{last}</div>
      )}

      {catalog.length === 0 ? (
        <div className="opacity-70">Catalog is empty. Drop a catalog.json into the store dir or fetch from a registry.</div>
      ) : visibleCatalog.length === 0 ? (
        <div className="opacity-70">No catalog entries match the current filters.</div>
      ) : (
        <ul className="space-y-2">
          {visibleCatalog.map(e => (
            <li key={e.manifest.packageId} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3" style={rowStyle}>
              <div className="min-w-0">
                <div className="font-medium truncate">{e.manifest.name ?? e.manifest.packageId}</div>
                <div className="text-xs opacity-70 truncate">
                  {e.manifest.packageId} - v{e.manifest.packageVersion} - rating {e.manifest.contentRating}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
                <button style={glassButton} disabled={busy !== null} onClick={() => onPlan(e.manifest.packageId)}>Plan</button>
                {isInstalled(e.manifest.packageId) ? (
                  <button
                    style={glassButton}
                    disabled={busy !== null}
                    onClick={() => onUninstall(e.manifest.packageId)}
                  >
                    {busy === e.manifest.packageId ? 'Removing...' : 'Uninstall'}
                  </button>
                ) : (
                  <button
                    style={glassButton}
                    disabled={busy !== null}
                    onClick={() => onInstall(e.manifest.packageId)}
                  >
                    {busy === e.manifest.packageId ? 'Installing...' : 'Install'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
