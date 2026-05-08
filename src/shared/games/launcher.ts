// =============================================================================
// DEX Platform — Track E1: game launcher discovery
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Pure parsers + classifiers for installed-game discovery. Real disk
 * scanning is host-side. This module turns raw discovery hits into
 * normalized library entries the renderer can render uniformly.
 */

export type GameSource = 'steam' | 'epic' | 'gog' | 'itch' | 'ea' | 'native' | 'web';

export interface DiscoveredGame {
  id: string;            // stable: source + appid
  source: GameSource;
  title: string;
  installPath?: string;
  iconPath?: string;
  /** Raw source-specific metadata. */
  raw?: Record<string, unknown>;
}

export interface SteamManifestRaw {
  appid: string;
  name: string;
  installdir?: string;
  StateFlags?: string;
}

export interface EpicManifestRaw {
  CatalogItemId?: string;
  AppName?: string;
  DisplayName?: string;
  InstallLocation?: string;
}

export function parseSteamManifest(m: SteamManifestRaw): DiscoveredGame | null {
  if (!m.appid || !m.name) return null;
  return {
    id: `steam:${m.appid}`,
    source: 'steam',
    title: m.name,
    installPath: m.installdir,
    raw: m as unknown as Record<string, unknown>,
  };
}

export function parseEpicManifest(m: EpicManifestRaw): DiscoveredGame | null {
  const id = m.CatalogItemId ?? m.AppName;
  const title = m.DisplayName ?? m.AppName;
  if (!id || !title) return null;
  return {
    id: `epic:${id}`,
    source: 'epic',
    title,
    installPath: m.InstallLocation,
    raw: m as unknown as Record<string, unknown>,
  };
}

export interface PlaytimeRecord {
  gameId: string;
  /** Total seconds. */
  totalSec: number;
  /** ISO of last session end. */
  lastPlayedIso?: string;
  /** Open sessions count. */
  sessions: number;
}

export function recordSession(prev: PlaytimeRecord | undefined, gameId: string, durationSec: number, endIso: string): PlaytimeRecord {
  if (!prev) return { gameId, totalSec: Math.max(0, durationSec), lastPlayedIso: endIso, sessions: 1 };
  return {
    gameId,
    totalSec: prev.totalSec + Math.max(0, durationSec),
    lastPlayedIso: endIso,
    sessions: prev.sessions + 1,
  };
}

export interface LaunchPlan {
  gameId: string;
  source: GameSource;
  /** Command tokens (host quotes). */
  command: string[];
  /** Working directory if known. */
  cwd?: string;
  /** Whether DEX overlay should attach. */
  overlay: boolean;
  /** Whether the launch is via 3rd-party launcher (Steam/Epic) or direct. */
  viaStorefront: boolean;
}

export function planLaunch(g: DiscoveredGame, opts?: { overlay?: boolean }): LaunchPlan {
  const overlay = opts?.overlay ?? false;
  switch (g.source) {
    case 'steam': {
      const id = g.id.split(':')[1]!;
      return { gameId: g.id, source: 'steam', command: ['steam', `steam://rungameid/${id}`], overlay, viaStorefront: true };
    }
    case 'epic': {
      const id = g.id.split(':')[1]!;
      return { gameId: g.id, source: 'epic', command: ['com.epicgames.launcher', `apps/${id}?action=launch`], overlay, viaStorefront: true };
    }
    case 'gog':
      return { gameId: g.id, source: 'gog', command: ['goggalaxy', `/command=runGame /gameId=${g.id.split(':')[1]}`], overlay, viaStorefront: true };
    case 'itch':
      return { gameId: g.id, source: 'itch', command: ['itch', '--launch', g.id.split(':')[1]!], overlay, viaStorefront: true };
    case 'ea':
      return { gameId: g.id, source: 'ea', command: ['origin2://library/open/' + g.id.split(':')[1]], overlay, viaStorefront: true };
    case 'native':
      return { gameId: g.id, source: 'native', command: g.installPath ? [g.installPath] : [], cwd: g.installPath, overlay, viaStorefront: false };
    case 'web':
      return { gameId: g.id, source: 'web', command: ['__internal:openWebRuntime', g.id], overlay: true, viaStorefront: false };
  }
}
