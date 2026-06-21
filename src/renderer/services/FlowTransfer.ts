// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX Flow -- Universal Send-to / Handoff
 * ===========================================================================
 *
 * The brief's "Handoff -> Flow Transfer": move a piece of work to any DEX app
 * without exporting/importing. The creative suite already had a closed
 * send-to (CreativeSuiteBridge); DEX Flow generalizes it OS-wide for ANY
 * content kind and ANY target app.
 *
 * Two delivery tiers, mirroring how real handoff feels:
 *   - RICH intake: a target that knows how to receive a payload directly
 *     (built-in: Browser opens a link / searches text; apps may register their
 *     own via `registerFlowIntake`).
 *   - UNIVERSAL fallback: copy the content to the clipboard, open the target
 *     app, and tell the user to paste. Works for every app today, with zero
 *     per-app wiring -- honest and immediately useful.
 *
 * Every send is also announced on ContextBus `continuity:handoff` so the rest
 * of the system (Nexus, Rewind, future inboxes) can observe cross-app flow.
 * ===========================================================================
 */

import { APP_DEFINITIONS } from '../store/runningApps';
import { ContextBus } from './ContextBus';
import type { ClipKind } from '../store/clipboardStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The kinds DEX Flow can route. Mirrors the Omni Clipboard's ClipKind plus
 *  a generic `snippet`, so a clip can be sent verbatim. */
export type FlowKind = ClipKind | 'snippet';

export interface FlowPayload {
  kind: FlowKind;
  content: string;
  /** Short human label for the picker preview. */
  label?: string;
  /** Originating app id, when known. */
  source?: string;
}

export interface FlowTarget {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** A rich intake handler: returns true if it fully handled the payload. */
export type FlowIntake = (payload: FlowPayload) => boolean | Promise<boolean>;

// ---------------------------------------------------------------------------
// Target suggestions per kind (OS-wide, not just creative)
// ---------------------------------------------------------------------------

const TARGETS_BY_KIND: Record<FlowKind, string[]> = {
  text:    ['notes', 'dexcode', 'browser', 'tasks'],
  snippet: ['notes', 'dexcode', 'browser'],
  code:    ['dexcode', 'notes'],
  link:    ['browser', 'notes'],
  color:   ['colorpicker', 'prism', 'flux'],
  email:   ['notes', 'browser'],
  path:    ['files', 'dexcode'],
  number:  ['calculator', 'notes'],
  image:   ['prism', 'flux', 'gallery', 'forge'],
  file:    ['files', 'forge'],
};

/** Apps that make sense as a destination for almost anything (shown after the
 *  kind-specific suggestions, deduped). */
const UNIVERSAL_TARGETS = ['notes', 'dexcode', 'files', 'browser'];

function toTarget(appId: string): FlowTarget | null {
  const def = APP_DEFINITIONS[appId];
  if (!def) return null;
  return { id: appId, name: def.name, icon: def.icon, color: def.color };
}

/** Ordered, deduped list of suggested destinations for a payload. */
export function getFlowTargets(payload: FlowPayload): FlowTarget[] {
  const ordered = [...(TARGETS_BY_KIND[payload.kind] ?? []), ...UNIVERSAL_TARGETS];
  const seen = new Set<string>();
  const out: FlowTarget[] = [];
  for (const id of ordered) {
    if (id === payload.source) continue; // don't suggest sending back to origin
    if (seen.has(id)) continue;
    seen.add(id);
    const t = toTarget(id);
    if (t) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rich intake registry (apps opt in; mirrors the UKI app-context registry)
// ---------------------------------------------------------------------------

const intakes = new Map<string, FlowIntake>();

export function registerFlowIntake(appId: string, handler: FlowIntake): void {
  intakes.set(appId, handler);
}
export function unregisterFlowIntake(appId: string): void {
  intakes.delete(appId);
}

// ---------------------------------------------------------------------------
// Built-in rich route: Browser (open a link, or search text)
// ---------------------------------------------------------------------------

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  return t;
}

function openApp(appId: string, contextId?: string): void {
  window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId, contextId } }));
}

function toast(type: 'success' | 'info' | 'error', message: string): void {
  window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

let _flowSeq = 0;

/**
 * Route `payload` to `appId`. Resolves once the open/intake is dispatched.
 * Never throws -- failures degrade to the universal clipboard fallback.
 */
export async function sendFlow(appId: string, payload: FlowPayload): Promise<void> {
  const def = APP_DEFINITIONS[appId];
  const name = def?.name ?? appId;

  // Announce the handoff for observers (Nexus/Rewind/inboxes).
  try {
    ContextBus.emit('continuity:handoff', {
      id: `flow-${Date.now().toString(36)}-${(_flowSeq = (_flowSeq + 1) % 100000)}`,
      from: payload.source ?? 'dex',
      to: appId,
      kind: 'selection',
      payload: { flowKind: payload.kind, content: payload.kind === 'image' ? '[image]' : payload.content.slice(0, 4096) },
    });
  } catch { /* observability is best-effort */ }

  // 1) Built-in Browser route -- links open, everything else searches.
  if (appId === 'browser') {
    const url = payload.kind === 'link'
      ? normalizeUrl(payload.content)
      : `https://www.google.com/search?q=${encodeURIComponent(payload.content.slice(0, 400))}`;
    openApp('browser', url);
    toast('success', payload.kind === 'link' ? `Opening in ${name}` : `Searching ${name}`);
    return;
  }

  // 2) Registered rich intake.
  const intake = intakes.get(appId);
  if (intake) {
    try {
      const handled = await intake(payload);
      if (handled) {
        openApp(appId);
        toast('success', `Sent to ${name}`);
        return;
      }
    } catch { /* fall through to the universal path */ }
  }

  // 3) Universal fallback -- copy + open + paste. Images go on the clipboard as
  // a real image blob so the target app can paste them as an image.
  try {
    if (payload.kind === 'image') {
      const blob = await (await fetch(payload.content)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
    } else {
      await navigator.clipboard.writeText(payload.content);
    }
  } catch { /* clipboard unavailable */ }
  openApp(appId);
  toast('info', `Sent to ${name} — paste to drop it in`);
}
