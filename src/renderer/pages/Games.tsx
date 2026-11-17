// =============================================================================
// DEX Platform — Phase 4 renderer: Games
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Minimal Games launcher. Scans installed games via GamesService and
 * lets the user launch them.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DexSearchInput } from '../styles/components';
import DexIcon from '../components/DexIcon';
import EmptyState from '../components/EmptyState';
import type { DiscoveredGame, LaunchPlan, PlaytimeRecord } from '../../shared/games/launcher';
import type { ScanResult } from '../../shared/games/scanner';

type IpcBridge = { invoke: (c: string, ...a: any[]) => Promise<any> };

// Per-storefront identity: label + accent used for the badge and cover wash.
const SOURCE_META: Record<string, { label: string; color: string }> = {
  steam: { label: 'Steam', color: '#66C0F4' },
  epic: { label: 'Epic', color: '#2F2D2E' },
  gog: { label: 'GOG', color: '#A05BD4' },
  itch: { label: 'itch.io', color: '#FA5C5C' },
  ea: { label: 'EA', color: '#FF4747' },
  native: { label: 'Installed', color: '#30D158' },
  web: { label: 'Web', color: '#0A84FF' },
};
const sourceMeta = (s: string) => SOURCE_META[s] ?? { label: s, color: '#8E8E93' };

// Deterministic cover art from the title -- a stable two-stop gradient so each
// game keeps the same colours across launches (no art assets needed).
function coverGradient(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  const h2 = (h + 38) % 360;
  return `linear-gradient(140deg, hsl(${h} 58% 32%), hsl(${h2} 62% 20%))`;
}

function formatPlaytime(totalSec: number): string {
  if (!totalSec || totalSec < 60) return 'Never played';
  const mins = Math.round(totalSec / 60);
  if (mins < 60) return `${mins} min played`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m ? ` ${m}m` : ''} played`;
}

// True-black SOLID theme (no glass) — matches the Trophies dashboard direction.
const G_PANEL = '#101012';
const G_PANEL2 = '#16161a';
const G_BORDER = '#26262b';
const G_DIM = '#8a8a90';

function formatHours(totalSec: number): string {
  if (totalSec < 3600) return `${Math.round(totalSec / 60)}m`;
  const h = totalSec / 3600;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

function relativeLastPlayed(iso?: string): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 3600) return 'Played recently';
  const h = Math.round(s / 3600);
  if (h < 24) return `Played ${h}h ago`;
  const d = Math.round(h / 24);
  return d <= 1 ? 'Played yesterday' : `Played ${d} days ago`;
}

const PlayGlyph = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
);

/** Solid (non-glass) action button matching the true-black theme. */
const actionButton = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 10,
  background: G_PANEL2,
  border: `1px solid ${G_BORDER}`,
  color: '#f1ece5',
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const ipc = (): IpcBridge => {
  const w = window as any;
  const bridge = w.dex;
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
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  // Favorites: local, persisted; a star on each card and a Favorites filter.
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('dex-games-favorites') || '[]')); } catch { return new Set(); }
  });
  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('dex-games-favorites', JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
  }, []);

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

  const availableSources = useMemo(() => {
    const set = new Set(games.map(g => g.source));
    return Array.from(set).sort();
  }, [games]);

  const visibleGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...games]
      .sort((a, b) => a.title.localeCompare(b.title))
      .filter(game => sourceFilter === 'all' || (sourceFilter === '__fav' ? favorites.has(game.id) : game.source === sourceFilter))
      .filter(game => !q || game.title.toLowerCase().includes(q) || game.id.toLowerCase().includes(q) || game.source.toLowerCase().includes(q));
  }, [games, query, sourceFilter, favorites]);

  // "Continue playing" rail: games with real playtime, most-recent first.
  const recentlyPlayed = useMemo(() => {
    return games
      .filter(g => (playtime[g.id]?.totalSec ?? 0) >= 60)
      .sort((a, b) => Date.parse(playtime[b.id]?.lastPlayedIso ?? '0') - Date.parse(playtime[a.id]?.lastPlayedIso ?? '0'))
      .slice(0, 8);
  }, [games, playtime]);

  // Real playtime overview (the reference's "Your Statistic" band).
  const totalPlaySec = useMemo(
    () => Object.values(playtime).reduce((n, p) => n + (p?.totalSec ?? 0), 0),
    [playtime],
  );
  const playedCount = useMemo(
    () => games.filter(g => (playtime[g.id]?.totalSec ?? 0) >= 60).length,
    [games, playtime],
  );
  const topGames = useMemo(
    () => games
      .map(g => ({ g, sec: playtime[g.id]?.totalSec ?? 0 }))
      .filter(x => x.sec >= 60)
      .sort((a, b) => b.sec - a.sec)
      .slice(0, 3),
    [games, playtime],
  );

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

  // A single cover card. Click anywhere or the play button launches; right-click
  // reveals the launch plan (the old "Plan" affordance, now out of the way).
  const renderCard = (g: DiscoveredGame) => {
    const pt = playtime[g.id];
    const meta = sourceMeta(g.source);
    const launching = busy === g.id;
    const disabled = busy !== null || scanning;
    const sub = relativeLastPlayed(pt?.lastPlayedIso) ?? formatPlaytime(pt?.totalSec ?? 0);
    return (
      <div
        key={g.id}
        className="dex-game-card"
        role="button"
        tabIndex={0}
        aria-label={`Launch ${g.title}`}
        title={`${g.title}\n${meta.label} - ${g.id}\nClick to launch, right-click for launch plan`}
        onClick={() => { if (!disabled) onLaunch(g.id); }}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); onLaunch(g.id); } }}
        onContextMenu={(e) => { e.preventDefault(); onPlan(g.id); }}
      >
        <div className="dex-game-cover" style={{ background: coverGradient(g.title) }}>
          <span className="dex-game-badge" style={{ background: `${meta.color}E6` }}>{meta.label}</span>
          <button
            type="button"
            aria-label={favorites.has(g.id) ? `Remove ${g.title} from Favorites` : `Add ${g.title} to Favorites`}
            aria-pressed={favorites.has(g.id)}
            onClick={(e) => { e.stopPropagation(); toggleFavorite(g.id); }}
            onKeyDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 9999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', color: favorites.has(g.id) ? '#FFD60A' : 'rgba(255,255,255,0.75)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={favorites.has(g.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          </button>
          <span className="dex-game-initial">{g.title.charAt(0).toUpperCase()}</span>
          <span className="dex-game-play" aria-hidden="true">
            {launching
              ? <span className="dex-game-spinner" />
              : <PlayGlyph size={22} />}
          </span>
        </div>
        <div style={{ padding: '8px 4px 2px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 h-full overflow-auto" style={{ borderRadius: 0, background: 'transparent', color: '#f1ece5' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div>
          <h1 className="text-2xl font-semibold">Games</h1>
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{games.length} discovered</div>
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
          <button style={actionButton(scanning || busy !== null)} onClick={refresh} disabled={scanning || busy !== null}>Refresh</button>
          <button style={actionButton(scanning)} onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </header>

      {last && <div className="text-sm" role="status" aria-live="polite" style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{last}</div>}

      {games.length === 0 ? (
        <EmptyState
          icon={<DexIcon name="gamepad-2" size={48} />}
          title="No games found yet"
          description="Scan your default storefront paths (Steam, Epic, GOG, Xbox...) to discover installed games."
          actions={[{ label: scanning ? 'Scanning...' : 'Scan for games', onClick: onScan }]}
        />
      ) : (
        <>
          <style>{`
            .dex-game-card { cursor: pointer; border-radius: var(--radius-lg); }
            .dex-game-cover { position: relative; aspect-ratio: 16 / 10; border-radius: var(--radius-lg); overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
            .dex-game-initial { font-size: 46px; font-weight: 800; color: rgba(255,255,255,0.22); letter-spacing: -0.02em; }
            .dex-game-badge { position: absolute; top: 8px; left: 8px; font-size: 10px; font-weight: 700; color: #fff; padding: 3px 7px; border-radius: 6px; letter-spacing: 0.02em; text-shadow: 0 1px 2px rgba(0,0,0,0.4); }
            .dex-game-play { position: absolute; right: 10px; bottom: 10px; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(0,0,0,0.45); opacity: 0; transform: scale(0.85); transition: opacity 0.16s ease, transform 0.16s ease; }
            .dex-game-card:hover .dex-game-play, .dex-game-card:focus-visible .dex-game-play { opacity: 1; transform: scale(1); }
            .dex-game-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: dexGameSpin 0.7s linear infinite; }
            @keyframes dexGameSpin { to { transform: rotate(360deg); } }
            .dex-game-chip { padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid var(--color-border, rgba(255,255,255,0.12)); background: transparent; color: var(--color-text-secondary); transition: all 0.12s ease; }
            .dex-game-chip[aria-pressed="true"] { background: var(--color-accent, #0A84FF); border-color: var(--color-accent, #0A84FF); color: #fff; }
          `}</style>

          {/* Playtime overview — total hours + top games (real games:playtime data). */}
          {totalPlaySec >= 60 && (
            <section style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
              padding: 18, marginBottom: 'var(--space-4)', borderRadius: 18,
              background: G_PANEL, border: `1px solid ${G_BORDER}`,
            }}>
              <div>
                <div style={{ fontSize: 11, color: G_DIM, textTransform: 'none', letterSpacing: '0.01em', fontWeight: 700 }}>Total playtime</div>
                <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4, letterSpacing: '-0.02em' }}>{formatHours(totalPlaySec)}</div>
                <div style={{ fontSize: 12, color: G_DIM, marginTop: 2 }}>{games.length} games · {playedCount} played</div>
              </div>
              {topGames.length > 0 && (
                <div style={{ display: 'flex', gap: 10 }}>
                  {topGames.map(({ g, sec }) => (
                    <div key={g.id} title={`${g.title} — ${formatHours(sec)}`} style={{
                      textAlign: 'center', minWidth: 84, padding: '11px 9px', borderRadius: 14,
                      background: G_PANEL2, border: `1px solid ${G_BORDER}`,
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, margin: '0 auto 8px',
                        background: coverGradient(g.title), display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontSize: 15,
                      }}>{g.title.charAt(0).toUpperCase()}</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{formatHours(sec)}</div>
                      <div style={{ fontSize: 10, color: G_DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 76 }}>{g.title}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {availableSources.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
              <button className="dex-game-chip" aria-pressed={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>All ({games.length})</button>
              {favorites.size > 0 && (
                <button className="dex-game-chip" aria-pressed={sourceFilter === '__fav'} onClick={() => setSourceFilter('__fav')}>Favorites ({games.filter(g => favorites.has(g.id)).length})</button>
              )}
              {availableSources.map(s => (
                <button key={s} className="dex-game-chip" aria-pressed={sourceFilter === s} onClick={() => setSourceFilter(s)}>
                  {sourceMeta(s).label} ({games.filter(g => g.source === s).length})
                </button>
              ))}
            </div>
          )}

          {recentlyPlayed.length > 0 && sourceFilter === 'all' && !query.trim() && (
            <section style={{ marginBottom: 'var(--space-5)' }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Continue playing</h2>
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'none' }}>
                {recentlyPlayed.map(g => (
                  <div key={g.id} style={{ width: 168, flexShrink: 0 }}>{renderCard(g)}</div>
                ))}
              </div>
            </section>
          )}

          {visibleGames.length === 0 ? (
            <EmptyState
              icon={<DexIcon name="search" size={48} />}
              title="No games match"
              description={`Nothing matches your filters. Try a different term or clear the search.`}
              actions={[{ label: 'Clear search', onClick: () => { setQuery(''); setSourceFilter('all'); }, variant: 'secondary' }]}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
              {visibleGames.map(renderCard)}
            </div>
          )}
        </>
      )}

      {errors.length > 0 && (
        <details className="mt-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <summary style={{ cursor: 'pointer' }}>{errors.length} scan error{errors.length === 1 ? '' : 's'}</summary>
          <ul className="mt-2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', listStyle: 'none', margin: 0, padding: 0 }}>
            {errors.map((er, i) => (
              <li key={i}>{er.source}: {er.path} - {er.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
