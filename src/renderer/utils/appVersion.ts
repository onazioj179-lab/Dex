// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
const FALLBACK_VERSION = import.meta.env.VITE_APP_VERSION || '3.6.0';

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
