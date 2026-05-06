// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * safeIpc -- uniform IPC envelope used by every DEX channel.
 *
 * Every IPC handler wrapped with `safeHandler(name, fn)` will:
 *   1. validate inbound payload via an optional zod-style guard
 *   2. catch any throw or rejection
 *   3. log a structured warning on failure (no PII)
 *   4. return an IpcEnvelope<T> with shape: {ok, value} | {ok:false, error}
 *
 * Renderers consume via `unwrapEnvelope(env)` which turns the envelope into
 * a Result<T> and never throws.
 *
 * The envelope shape is intentionally flat to survive structured-clone over
 * Electron's IPC and to be JSON-safe for logging.
 */

import { type Result, ok, err, toDexError, type DexError, safeJSON } from './result';

export interface IpcEnvelope<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: DexError;
  readonly t: number;       // timestamp for trace
  readonly op: string;      // channel name for trace
}

export type IpcGuard<T> = (v: unknown) => v is T;

export function envelopeOk<T>(op: string, value: T): IpcEnvelope<T> {
  return { ok: true, value, t: Date.now(), op };
}

export function envelopeErr(op: string, error: DexError): IpcEnvelope<never> {
  return { ok: false, error, t: Date.now(), op };
}

export function unwrapEnvelope<T>(env: unknown): Result<T> {
  if (!env || typeof env !== 'object') {
    return err(toDexError({ code: 'E_IPC_SHAPE', message: 'envelope was not an object' }));
  }
  const e = env as IpcEnvelope<T>;
  if (e.ok === true) return ok(e.value as T);
  return err(e.error ?? toDexError({ code: 'E_IPC_UNKNOWN', message: 'envelope had no error payload' }, e.op));
}

/**
 * Wrap a main-process handler so all throws turn into structured envelopes.
 * Logger may be supplied or will fall back to console.warn.
 */
export interface SafeHandlerOptions<I> {
  readonly guard?: IpcGuard<I>;
  readonly log?: (level: 'warn' | 'error', message: string, data?: unknown) => void;
}

export function safeHandler<I, O>(
  op: string,
  fn: (input: I) => Promise<O> | O,
  opts: SafeHandlerOptions<I> = {},
): (input: unknown) => Promise<IpcEnvelope<O>> {
  const log = opts.log ?? ((lvl, m, d) => {
    // eslint-disable-next-line no-console
    (lvl === 'error' ? console.error : console.warn)(`[ipc:${op}] ${m}`, d ?? '');
  });
  return async (input: unknown): Promise<IpcEnvelope<O>> => {
    try {
      if (opts.guard && !opts.guard(input)) {
        const e = toDexError({ code: 'E_IPC_GUARD', message: 'input failed runtime guard' }, op);
        log('warn', 'guard rejected payload');
        return envelopeErr(op, e);
      }
      const value = await fn(input as I);
      return envelopeOk(op, value);
    } catch (cause) {
      const e = toDexError(cause, op, 'E_IPC_THROW');
      log('error', `handler threw: ${e.message}`, { code: e.code });
      return envelopeErr(op, e);
    }
  };
}

/**
 * Renderer-side helper: invoke a channel and always receive a Result.
 * Bridges accept either `invoke(channel, payload)` or `(channel) => promise`.
 */
export async function callIpc<O>(
  bridge: { invoke: (channel: string, payload?: unknown) => Promise<unknown> } | undefined | null,
  channel: string,
  payload?: unknown,
): Promise<Result<O>> {
  if (!bridge || typeof bridge.invoke !== 'function') {
    return err(toDexError({ code: 'E_IPC_BRIDGE', message: 'IPC bridge unavailable' }, channel));
  }
  try {
    const env = await bridge.invoke(channel, payload);
    return unwrapEnvelope<O>(env);
  } catch (cause) {
    return err(toDexError(cause, channel, 'E_IPC_TRANSPORT'));
  }
}

/**
 * Helper for tests / fallbacks. Round-trips a value through JSON to confirm
 * it would survive structured clone (catches Date, Map, Set, undefined, etc.).
 */
export function isStructuredCloneSafe(value: unknown): boolean {
  const s = safeJSON.stringify(value);
  if (!s.ok) return false;
  const p = safeJSON.parse(s.value);
  return p.ok;
}
