// =============================================================================
// DEX Platform — Phase 4 renderer: Store
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Minimal Store browser. Lists catalog entries from the AppStoreService
 * and lets the user install / uninstall. Real catalog fetch + rich UI
 * follow in a later pass.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { glassPanel, glassButton } from '../styles/glassMenu';
import type { CatalogEntry, InstalledApp, PlanResult } from '../../shared/store/catalog';
import type { InstallResult } from '../../shared/store/installer';

const ipc = (): { invoke: (c: string, ...a: any[]) => Promise<any> } => {
  const w = window as any;
  return w.dexAPI ?? w.electronAPI ?? w.electron;
};

export default function Store(): React.ReactElement {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<string>('');

  const refresh = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([
        ipc().invoke('store:list'),
        ipc().invoke('store:installed'),
      ]);
      setCatalog(Array.isArray(c) ? c : []);
      setInstalled(Array.isArray(i) ? i : []);
    } catch (e) {
      setLast(`refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const isInstalled = useCallback((id: string) => installed.some(a => a.packageId === id), [installed]);

  const onInstall = useCallback(async (id: string) => {
    setBusy(id);
    setLast('');
    try {
      const r = (await ipc().invoke('store:install', id)) as InstallResult;
      setLast(r.ok ? `installed ${r.packageId} ${r.version ?? ''}` : `failed: ${r.error}`);
      await refresh();
    } catch (e) {
      setLast(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const onUninstall = useCallback(async (id: string) => {
    setBusy(id);
    setLast('');
    try {
      const ok = await ipc().invoke('store:uninstall', id);
      setLast(ok ? `removed ${id}` : `not installed: ${id}`);
      await refresh();
    } catch (e) {
      setLast(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const onPlan = useCallback(async (id: string) => {
    try {
      const p = (await ipc().invoke('store:plan', id)) as PlanResult | null;
      if (!p) { setLast(`no plan for ${id}`); return; }
      if (!p.ok) { setLast(`plan: ${p.reason}`); return; }
      setLast(`plan ${p.pathway}: ${p.steps.length} steps`);
    } catch (e) {
      setLast(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  return (
    <div className="p-6 h-full overflow-auto" style={glassPanel}>
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">DEX Store</h1>
        <button style={glassButton} onClick={refresh}>Refresh</button>
      </header>

      {last && (
        <div className="mb-3 text-sm opacity-80" role="status">{last}</div>
      )}

      {catalog.length === 0 ? (
        <div className="opacity-70">Catalog is empty. Drop a catalog.json into the store dir or fetch from a registry.</div>
      ) : (
        <ul className="space-y-2">
          {catalog.map(e => (
            <li key={e.manifest.packageId} className="flex items-center justify-between p-3 rounded" style={glassPanel}>
              <div className="min-w-0">
                <div className="font-medium truncate">{e.manifest.name ?? e.manifest.packageId}</div>
                <div className="text-xs opacity-70 truncate">
                  {e.manifest.packageId} · v{e.manifest.packageVersion} · rating {e.manifest.contentRating}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button style={glassButton} onClick={() => onPlan(e.manifest.packageId)}>Plan</button>
                {isInstalled(e.manifest.packageId) ? (
                  <button
                    style={glassButton}
                    disabled={busy === e.manifest.packageId}
                    onClick={() => onUninstall(e.manifest.packageId)}
                  >
                    {busy === e.manifest.packageId ? 'Removing…' : 'Uninstall'}
                  </button>
                ) : (
                  <button
                    style={glassButton}
                    disabled={busy === e.manifest.packageId}
                    onClick={() => onInstall(e.manifest.packageId)}
                  >
                    {busy === e.manifest.packageId ? 'Installing…' : 'Install'}
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
