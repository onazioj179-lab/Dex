// =============================================================================
// DEX Platform — Phase 4 renderer: Games
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Minimal Games launcher. Scans installed games via GamesService and
 * lets the user launch them.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { glassPanel, glassButton } from '../styles/glassMenu';
import type { DiscoveredGame, LaunchPlan, PlaytimeRecord } from '../../shared/games/launcher';
import type { ScanResult } from '../../shared/games/scanner';

const ipc = (): { invoke: (c: string, ...a: any[]) => Promise<any> } => {
  const w = window as any;
  return w.dexAPI ?? w.electronAPI ?? w.electron;
};

export default function Games(): React.ReactElement {
  const [games, setGames] = useState<DiscoveredGame[]>([]);
  const [errors, setErrors] = useState<ScanResult['errors']>([]);
  const [playtime, setPlaytime] = useState<Record<string, PlaytimeRecord>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [last, setLast] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [list, pt] = await Promise.all([
        ipc().invoke('games:list'),
        ipc().invoke('games:playtime'),
      ]);
      setGames(Array.isArray(list) ? list : []);
      setPlaytime(pt && typeof pt === 'object' ? pt : {});
    } catch (e) {
      setLast(`refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const onScan = useCallback(async () => {
    setScanning(true);
    setLast('');
    try {
      const r = (await ipc().invoke('games:scan')) as ScanResult;
      setGames(r.games);
      setErrors(r.errors);
      setLast(`scanned: ${r.games.length} games, ${r.errors.length} errors`);
      await refresh();
    } catch (e) {
      setLast(`scan failed: ${e instanceof Error ? e.message : String(e)}`);
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
      setLast(r?.ok ? `launched ${id} (pid ${r.pid ?? '?'})` : `failed: ${r?.error ?? 'unknown'}`);
    } catch (e) {
      setLast(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const onPlan = useCallback(async (id: string) => {
    try {
      const p = (await ipc().invoke('games:plan-launch', id)) as LaunchPlan | null;
      if (!p) { setLast(`no plan for ${id}`); return; }
      setLast(`${p.source}: ${p.command.join(' ')}`);
    } catch (e) {
      setLast(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  return (
    <div className="p-6 h-full overflow-auto" style={glassPanel}>
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Games</h1>
        <div className="flex gap-2">
          <button style={glassButton} onClick={refresh}>Refresh</button>
          <button style={glassButton} onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </div>
      </header>

      {last && <div className="mb-3 text-sm opacity-80" role="status">{last}</div>}

      {games.length === 0 ? (
        <div className="opacity-70">No games found yet. Hit Scan to look in default storefront paths.</div>
      ) : (
        <ul className="space-y-2">
          {games.map(g => {
            const pt = playtime[g.id];
            return (
              <li key={g.id} className="flex items-center justify-between p-3 rounded" style={glassPanel}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{g.title}</div>
                  <div className="text-xs opacity-70 truncate">
                    {g.source} · {g.id}
                    {pt ? ` · ${Math.round(pt.totalSec / 60)} min` : ''}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button style={glassButton} onClick={() => onPlan(g.id)}>Plan</button>
                  <button
                    style={glassButton}
                    disabled={busy === g.id}
                    onClick={() => onLaunch(g.id)}
                  >
                    {busy === g.id ? 'Launching…' : 'Launch'}
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
              <li key={i}>{er.source}: {er.path} — {er.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
