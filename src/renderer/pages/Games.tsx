// =============================================================================
// DEX Platform — Phase 4 renderer: Games
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Minimal Games launcher. Scans installed games via GamesService and
 * lets the user launch them.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { glassPanel, glassButton } from '../styles/glassMenu';
import { DexSearchInput } from '../styles/components';
import DexIcon from '../components/DexIcon';
import EmptyState from '../components/EmptyState';
import type { DiscoveredGame, LaunchPlan, PlaytimeRecord } from '../../shared/games/launcher';
import type { ScanResult } from '../../shared/games/scanner';

type IpcBridge = { invoke: (c: string, ...a: any[]) => Promise<any> };

const rowStyle: React.CSSProperties = {
  background: 'var(--color-bg-surface)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
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

export default function Games(): React.ReactElement {
  const [games, setGames] = useState<DiscoveredGame[]>([]);
  const [errors, setErrors] = useState<ScanResult['errors']>([]);
  const [playtime, setPlaytime] = useState<Record<string, PlaytimeRecord>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [last, setLast] = useState('');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [list, pt] = await Promise.all([
        ipc().invoke('games:list'),
        ipc().invoke('games:playtime'),
      ]);
      setGames(Array.isArray(list) ? list : []);
      setPlaytime(pt && typeof pt === 'object' ? pt : {});
    } catch (e) {
      setLast(`Refresh failed: ${toMessage(e)}`);
    }
  }, []);

  const visibleGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...games]
      .sort((a, b) => a.title.localeCompare(b.title))
      .filter(game => !q || game.title.toLowerCase().includes(q) || game.id.toLowerCase().includes(q) || game.source.toLowerCase().includes(q));
  }, [games, query]);

  const onScan = useCallback(async () => {
    setScanning(true);
    setLast('');
    try {
      const r = (await ipc().invoke('games:scan')) as ScanResult;
      const found = Array.isArray(r?.games) ? r.games : [];
      const scanErrors = Array.isArray(r?.errors) ? r.errors : [];
      setGames(found);
      setErrors(scanErrors);
      setLast(`Scanned: ${found.length} games, ${scanErrors.length} errors`);
      await refresh();
    } catch (e) {
      setLast(`Scan failed: ${toMessage(e)}`);
    } finally {
      setScanning(false);
    }
  }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  const onLaunch = useCallback(async (id: string) => {
    setBusy(id);
    setLast('');
    try {
      const r = await ipc().invoke('games:launch', id);
      setLast(r?.ok ? `Launched ${id} (pid ${r.pid ?? '?'})` : `Launch failed: ${r?.error ?? 'unknown'}`);
    } catch (e) {
      setLast(`Error: ${toMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const onPlan = useCallback(async (id: string) => {
    try {
      const p = (await ipc().invoke('games:plan-launch', id)) as LaunchPlan | null;
      if (!p) { setLast(`No plan for ${id}`); return; }
      setLast(`${p.source}: ${p.command.join(' ')}`);
    } catch (e) {
      setLast(`Error: ${toMessage(e)}`);
    }
  }, []);

  return (
    <div className="p-6 h-full overflow-auto" style={glassPanel}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div>
          <h1 className="text-2xl font-semibold">Games</h1>
          <div className="text-xs opacity-70">{games.length} discovered</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <DexSearchInput
            aria-label="Search games"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery('')}
            placeholder="Search games"
            size="md"
            style={{ minWidth: 220 }}
          />
          <button style={glassButton} onClick={refresh} disabled={scanning || busy !== null}>Refresh</button>
          <button style={glassButton} onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </header>

      {last && <div className="mb-3 text-sm opacity-80 break-words" role="status" aria-live="polite">{last}</div>}

      {games.length === 0 ? (
        <EmptyState
          icon={<DexIcon name="gamepad-2" size={48} />}
          title="No games found yet"
          description="Scan your default storefront paths (Steam, Epic, GOG, Xbox...) to discover installed games."
          actions={[{ label: scanning ? 'Scanning...' : 'Scan for games', onClick: onScan }]}
        />
      ) : visibleGames.length === 0 ? (
        <EmptyState
          icon={<DexIcon name="search" size={48} />}
          title="No games match your search"
          description={`Nothing matches "${query.trim()}". Try a different term or clear the search.`}
          actions={[{ label: 'Clear search', onClick: () => setQuery(''), variant: 'secondary' }]}
        />
      ) : (
        <ul className="space-y-2">
          {visibleGames.map(g => {
            const pt = playtime[g.id];
            return (
              <li key={g.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3" style={rowStyle}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{g.title}</div>
                  <div className="text-xs opacity-70 truncate">
                    {g.source} - {g.id}
                    {pt ? ` - ${Math.round(pt.totalSec / 60)} min` : ''}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
                  <button style={glassButton} disabled={busy !== null || scanning} onClick={() => onPlan(g.id)}>Plan</button>
                  <button
                    style={glassButton}
                    disabled={busy !== null || scanning}
                    onClick={() => onLaunch(g.id)}
                  >
                    {busy === g.id ? 'Launching...' : 'Launch'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {errors.length > 0 && (
        <details className="mt-4 text-sm opacity-80">
          <summary>{errors.length} scan error{errors.length === 1 ? '' : 's'}</summary>
          <ul className="mt-2 space-y-1">
            {errors.map((er, i) => (
              <li key={i}>{er.source}: {er.path} - {er.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
