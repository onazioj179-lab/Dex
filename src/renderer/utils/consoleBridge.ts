// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// consoleBridge
// ---------------------------------------------------------------------------
// In production builds the chromium devtools console is closed and renderer
// `console.error`/`console.warn` calls vanish. To keep real prod failures
// visible we forward both levels to the main-process electron-log via the
// existing `diagnostics:log` IPC. The bridge is a no-op when the IPC is
// unavailable (tests, isolated previews) and cannot recurse — it never logs
// errors raised by its own forwarder.
// ---------------------------------------------------------------------------

let installed = false;

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function installConsoleBridge(): void {
  if (installed) return;
  installed = true;
  if (typeof window === 'undefined') return;

  const api: any = (globalThis as any).dexAPI?.diagnostics;
  if (!api?.log) return; // no IPC bridge — leave console untouched

  let forwarding = false;
  const wrap = (level: 'warn' | 'error', original: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      original(...args);
      if (forwarding) return; // recursion guard
      forwarding = true;
      try {
        const message = args.map(safeStringify).join(' ');
        // Fire-and-forget. Failures must never throw out of console.*.
        Promise.resolve(api.log(level, 'renderer', message)).catch(() => {});
      } catch {
        /* intentional: bridge must never crash the renderer */
      } finally {
        forwarding = false;
      }
    };
  };

  // eslint-disable-next-line no-console
  console.warn = wrap('warn', console.warn.bind(console));
  // eslint-disable-next-line no-console
  console.error = wrap('error', console.error.bind(console));
}
