// =============================================================================
// DEX 6.0 — uki app-action registry (renderer singleton)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Process-wide instance of the shared app-action registry
// (src/shared/uki/appActions.ts). Apps register CALLABLE actions on mount (next
// to their context resolver); the agent loop discovers the actions of currently
// RUNNING apps and invokes them as dynamic tools. Read-only actions run freely;
// document-changing (mutating) actions require explicit user confirmation via a
// host-supplied confirm handler, so UKI can never silently mutate an app.

import {
  createAppActionRegistry,
  registerAppAction,
  unregisterAppAction,
  getAppAction,
  listAppActions,
  actionToToolSpec,
  type AppActionEntry,
  type AppActionHandler,
  type AppActionSpec,
} from '../../shared/uki/appActions';
import type { ToolSpec } from '../../shared/uki/toolValidation';
import { useRunningApps } from '../store/runningApps';

const registry = createAppActionRegistry();

/** Asks the user to approve a mutating action; resolves true to proceed. */
export type ActionConfirmHandler = (
  entry: AppActionEntry,
  args: Record<string, unknown>,
) => Promise<boolean> | boolean;

let confirmHandler: ActionConfirmHandler | null = null;

/** Wire (or clear) the confirmation surface for mutating actions. */
export function setUkiActionConfirmHandler(fn: ActionConfirmHandler | null): void {
  confirmHandler = fn;
}

/** Register (or replace) an action for an app. Call from the component's effect. */
export function registerUkiAppAction(
  appId: string,
  spec: AppActionSpec,
  handler: AppActionHandler,
): void {
  registerAppAction(registry, { appId, spec, handler });
}

/** Remove an action (call from effect cleanup). */
export function unregisterUkiAppAction(id: string): void {
  unregisterAppAction(registry, id);
}

function runningAppIds(): Set<string> {
  try {
    return new Set(useRunningApps.getState().runningApps.map((a) => a.id));
  } catch {
    return new Set();
  }
}

/** Actions whose owning app is currently running — the agent's discovery scope. */
export function listRunnableUkiActions(): AppActionEntry[] {
  const running = runningAppIds();
  return listAppActions(registry).filter((e) => running.has(e.appId));
}

/** Runnable actions adapted to agent ToolSpecs (merge via createToolCatalog). */
export function runnableActionToolSpecs(): ToolSpec[] {
  return listRunnableUkiActions().map((e) => actionToToolSpec(e.spec));
}

/** True if `id` is a registered app action (vs. a core tool). */
export function isUkiAppAction(id: string): boolean {
  return !!getAppAction(registry, id);
}

/**
 * Run a registered action by id. Returns a model-facing RESULT string and never
 * throws — errors, missing apps and denied confirmations all come back as a
 * RESULT the agent can read and recover from.
 */
export async function runUkiAction(id: string, args: Record<string, unknown>): Promise<string> {
  const entry = getAppAction(registry, id);
  if (!entry) return `Unknown app action "${id}".`;
  if (!runningAppIds().has(entry.appId)) {
    return `${entry.appId} is not running — open it first with open_app, then retry.`;
  }
  if (entry.spec.mutates) {
    let allowed = false;
    if (confirmHandler) {
      try {
        allowed = await confirmHandler(entry, args);
      } catch {
        allowed = false;
      }
    }
    if (!allowed) {
      return `"${id}" changes ${entry.appId} and needs the user's confirmation, which was not given. Not performed.`;
    }
  }
  try {
    const out = await entry.handler(args);
    return typeof out === 'string' && out.trim() ? out : 'Done.';
  } catch (e) {
    return `Action "${id}" failed: ${(e as Error)?.message || 'error'}`;
  }
}
