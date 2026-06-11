// =============================================================================
// DEX 6.0 — uki app-context registry (renderer singleton)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// A process-wide instance of the shared app-context resolver registry
// (src/shared/uki/appContext.ts). Apps register a resolver on mount that
// answers "what is the user looking at right now?" for that app (focused item,
// current file, selection). uki surfaces (the chat app, command bar, overlay)
// read the registered snapshots and fold them into the model prompt, so the
// assistant is aware of the active note/file/selection without each surface
// re-implementing per-app lookups. Resolvers are pure and read live state when
// called, so registering once at mount is enough — no re-register churn.

import {
  createAppContextResolver,
  registerAppContext,
  unregisterAppContext,
  resolveAllAppContexts,
  formatContextForPrompt,
  type AppContextSnapshot,
  type AppContextResolverFn,
} from '../../shared/uki/appContext';
import { useRunningApps } from '../store/runningApps';

const registry = createAppContextResolver();

// Built-in fallback: give uki the foreground app + current text selection for
// ANY app, so even apps without a dedicated resolver contribute context. Defers
// to a richer per-app resolver (e.g. Notes) when one is registered for the
// active app, so context is never double-reported.
registerAppContext(registry, '_foreground', () => {
  const appId = useRunningApps.getState().currentAppId;
  if (!appId || appId === 'home') return undefined;
  if (registry.resolvers.has(appId)) return undefined;
  const selectionText = window.getSelection?.()?.toString().trim();
  return { appId, selectionText: selectionText || undefined };
});

/** Register (or replace) the context resolver for an app. */
export function registerUkiAppContext(appId: string, fn: AppContextResolverFn): void {
  registerAppContext(registry, appId, fn);
}

/** Remove an app's resolver (call from the component's effect cleanup). */
export function unregisterUkiAppContext(appId: string): void {
  unregisterAppContext(registry, appId);
}

/** Every currently-resolvable app snapshot (undefined results are skipped). */
export function resolveAllUkiContexts(): AppContextSnapshot[] {
  return resolveAllAppContexts(registry);
}

/**
 * Render all registered app contexts as a compact, bounded prompt block, or an
 * empty string when nothing is registered/resolvable. Each app is capped so a
 * single noisy app cannot dominate the budget; the whole block is capped too.
 */
export function formatUkiContexts(perAppChars = 600, totalChars = 1600): string {
  const snaps = resolveAllUkiContexts();
  if (snaps.length === 0) return '';
  const block = snaps.map((s) => formatContextForPrompt(s, perAppChars)).join('\n---\n');
  return block.length > totalChars ? block.slice(0, totalChars - 1) + '…' : block;
}
