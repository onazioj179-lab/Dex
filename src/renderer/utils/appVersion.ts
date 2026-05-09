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
