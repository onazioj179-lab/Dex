// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Platform bridge — the Electron↔Tauri migration seam (GOAL-6A).
 *
 * The same renderer runs under two shells during the 6.0 transition. Feature
 * code calls these functions instead of a shell-specific API; the bridge
 * dispatches to the Tauri native core when present, otherwise the in-renderer TS
 * implementation (today's Electron app). This slice wires exactly one channel —
 * `smartRouterRoute` — to prove the seam end-to-end; the rest of the
 * `window.dex` IPC surface migrates here in later 6A slices.
 */

import { routeConfiguredModels, configuredCandidates } from '../../uki/providers/connect';
import type { RoutingGoal } from '../../../shared/uki/smartRouter';

export type ShellKind = 'tauri' | 'web';

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Tauri v2 exposes `invoke` on `window.__TAURI__.core` (v1: `window.__TAURI__`). */
function tauriInvoke(): TauriInvoke | null {
  const t = (globalThis as { __TAURI__?: { core?: { invoke?: TauriInvoke }; invoke?: TauriInvoke } }).__TAURI__;
  return t?.core?.invoke ?? t?.invoke ?? null;
}

/** Which desktop shell is hosting the renderer right now. */
export function detectShell(): ShellKind {
  if (tauriInvoke()) return 'tauri';
  return 'web';
}

// The cross-shell capability API (the "blend" layer) — one import for callers.
export {
  getCapabilities,
  hasNative,
  TAURI_NATIVE_SUBSYSTEMS,
  type Capabilities,
} from './capabilities';

/**
 * Rank the configured models for a goal + prompt. Under Tauri this calls the
 * native `dex-smart-router` crate via `smart_router_route`; under Electron/web it
 * runs the equivalent TS policy. Identical contract either way — that is the
 * point of the seam. If the native call fails for any reason it degrades to the
 * in-renderer path, so callers never see a shell-specific failure.
 */
export async function smartRouterRoute(goal: RoutingGoal, userText: string): Promise<string[]> {
  const invoke = tauriInvoke();
  if (invoke) {
    try {
      const out = await invoke('smart_router_route', {
        goal,
        userText,
        candidates: configuredCandidates(goal),
      });
      if (Array.isArray(out)) return out as string[];
    } catch {
      /* fall through to the in-renderer policy */
    }
  }
  return routeConfiguredModels(goal, userText);
}
