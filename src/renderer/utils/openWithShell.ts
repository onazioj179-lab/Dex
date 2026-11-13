// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Open a file, reveal it in Explorer, or open a link with the OS, and say so
// when that fails. The native shell channels answer `{success:false, error}`
// (file gone, path refused by the open policy, no handler for a URI) instead
// of throwing, and call sites ignored the reply, so the click did nothing and
// nothing was said (backlog #61).

export type ShellOpenKind = 'path' | 'reveal' | 'external';

const CHANNEL: Record<ShellOpenKind, string> = {
  path: 'shell:openPath',
  reveal: 'shell:showItemInFolder',
  external: 'shell:openExternal',
};

const VERB: Record<ShellOpenKind, string> = {
  path: 'open',
  reveal: 'show in File Explorer',
  external: 'open',
};

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

function toast(message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message } })); } catch { /* non-DOM */ }
}

/** The reply's failure reason, or null when the reply means it worked. */
export function shellFailure(reply: unknown): string | null {
  if (reply && typeof reply === 'object' && (reply as { success?: unknown }).success === false) {
    const e = (reply as { error?: unknown }).error;
    return typeof e === 'string' && e.trim() ? e.trim() : 'the system refused';
  }
  // Electron's shell.openPath resolved to an error string ('' on success).
  if (typeof reply === 'string' && reply.trim()) return reply.trim();
  return null;
}

/**
 * Returns true when the OS accepted the request. `label` names the thing in
 * the message ("Pictures", "report.pdf"); defaults to the target.
 */
export async function openWithShell(kind: ShellOpenKind, target: string, label?: string): Promise<boolean> {
  const name = label || target;
  const invoke = (globalThis as { dex?: { invoke?: Invoke } }).dex?.invoke;
  if (typeof invoke !== 'function') {
    // Web preview: links can still open in a browser tab; files cannot.
    if (kind === 'external') {
      try { return window.open(target, '_blank', 'noopener,noreferrer') !== null; } catch { /* blocked */ }
    }
    toast(`Couldn't ${VERB[kind]} ${name}: this needs the DEX app.`);
    return false;
  }
  try {
    const why = shellFailure(await invoke(CHANNEL[kind], target));
    if (why) { toast(`Couldn't ${VERB[kind]} ${name}: ${why}.`.replace(/\.\.$/, '.')); return false; }
    return true;
  } catch (e) {
    toast(`Couldn't ${VERB[kind]} ${name}: ${e instanceof Error && e.message ? e.message : 'the request failed'}.`.replace(/\.\.$/, '.'));
    return false;
  }
}
