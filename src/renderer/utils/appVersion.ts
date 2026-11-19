// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// VITE_APP_VERSION is wired in vite.config.ts to the live npm_package_version,
// so this constant is correct for every build. Renderer code should prefer
// getRuntimeAppVersion() (it asks main and falls back here on failure).
const FALLBACK_VERSION = (import.meta.env.VITE_APP_VERSION as string) || '0.0.0';

export const getBundledAppVersion = (): string => FALLBACK_VERSION;

export const getRuntimeAppVersion = async (): Promise<string> => {
  try {
    const runtime = await (window as any)?.dex?.rewind?.getAppVersion?.();
    if (typeof runtime === 'string' && runtime.trim()) return runtime;
  } catch {
    // noop
  }
  return FALLBACK_VERSION;
};

/**
 * Build serial (package.json "dexBuild", e.g. "18a"). The version number only
 * moves when the owner bumps it; the serial marks every update in between.
 */
export const getBuildSerial = (): string => ((import.meta.env.VITE_DEX_BUILD as string) || '').trim();

/** "7.0.2 (001z)" — or just the version when no serial is set. */
export const formatDisplayVersion = (version: string, serial: string = getBuildSerial()): string =>
  serial ? `${version} (${serial})` : version;

export const getDisplayVersion = (): string => formatDisplayVersion(FALLBACK_VERSION);

/** Build identity from scripts/build-info.mjs (same rule as src-tauri/build.rs). */
export interface BuildInfo { version: string; serial: string; buildNumber: number; buildId: string; commit: string; channel: string; builtAt: string }

export const getBuildInfo = (): BuildInfo => {
  const raw = (import.meta.env.VITE_DEX_BUILD_INFO as unknown) ?? null;
  const v = (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw) as Partial<BuildInfo> | null;
  return {
    version: v?.version || FALLBACK_VERSION,
    serial: v?.serial ?? getBuildSerial(),
    buildNumber: Number(v?.buildNumber) || 0,
    buildId: v?.buildId || FALLBACK_VERSION,
    commit: v?.commit || 'unknown',
    channel: v?.channel || 'development',
    builtAt: v?.builtAt || '',
  };
};

/** One line for diagnostics and bug reports. */
export const formatBuildInfo = (b: BuildInfo = getBuildInfo()): string =>
  `DEX OS ${b.buildId}${b.serial ? ` (${b.serial})` : ''} · ${b.channel} · commit ${b.commit}${b.builtAt ? ` · built ${b.builtAt}` : ''}`;
