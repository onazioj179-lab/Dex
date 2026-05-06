// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Result<T, E> -- a typed success/failure value used everywhere DEX crosses a
 * trust boundary (IPC, native FFI, plugins, JSON parsing, file I/O).
 *
 * Throwing across these boundaries leaks stack frames, breaks structured
 * cloning, and forces every caller to wrap in try/catch. Result keeps
 * failure inside the type system so the compiler enforces handling.
 *
 * Companion helpers:
 *   - safeJSON.parse / stringify  -- never throws, returns Result.
 *   - assertNever                 -- exhaustiveness in switch defaults.
 *   - panic                       -- last-resort throw with op context.
 *   - nonNull                     -- narrow x|null|undefined to x.
 *
 * This module is dependency-free and safe for both renderer and main.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = DexError> = Ok<T> | Err<E>;

export interface DexError {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly op?: string;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> { return r.ok === true; }
export function isErr<T, E>(r: Result<T, E>): r is Err<E> { return r.ok === false; }

export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

export function mapErr<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

export function unwrap<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

export function unwrapOrThrow<T, E>(r: Result<T, E>, op?: string): T {
  if (r.ok) return r.value;
  throw toError(r.error, op);
}

/** Convert any error-shaped value into a DexError without throwing. */
export function toDexError(cause: unknown, op?: string, code = 'E_UNKNOWN'): DexError {
  if (cause && typeof cause === 'object' && 'code' in cause && 'message' in cause) {
    const c = cause as DexError;
    return { code: c.code || code, message: c.message || String(cause), cause: c.cause, op: op ?? c.op };
  }
  if (cause instanceof Error) {
    return { code, message: cause.message, cause, op };
  }
  return { code, message: typeof cause === 'string' ? cause : safeStringify(cause), cause, op };
}

function toError(e: unknown, op?: string): Error {
  const d = toDexError(e, op);
  const err = new Error(`${d.code}: ${d.message}${d.op ? ` [op=${d.op}]` : ''}`);
  (err as any).cause = d.cause;
  (err as any).code = d.code;
  return err;
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return Object.prototype.toString.call(v); }
}

/** Wrap a synchronous thunk so it returns a Result instead of throwing. */
export function tryCatch<T>(fn: () => T, op?: string): Result<T> {
  try { return ok(fn()); }
  catch (e) { return err(toDexError(e, op, 'E_THROW')); }
}

/** Wrap an async thunk so it returns a Result instead of rejecting. */
export async function tryCatchAsync<T>(fn: () => Promise<T>, op?: string): Promise<Result<T>> {
  try { return ok(await fn()); }
  catch (e) { return err(toDexError(e, op, 'E_THROW')); }
}

/** Exhaustiveness helper for `switch` defaults. */
export function assertNever(x: never, op?: string): never {
  throw toError({ code: 'E_UNREACHABLE', message: `unreachable value: ${safeStringify(x)}` }, op);
}

/** Last-resort throw with structured context. Prefer Result over panic. */
export function panic(message: string, op?: string, cause?: unknown): never {
  throw toError({ code: 'E_PANIC', message, cause }, op);
}

/** Narrow `T | null | undefined` to `T`, or panic with op context. */
export function nonNull<T>(x: T | null | undefined, op?: string): T {
  if (x === null || x === undefined) panic('expected non-null value', op);
  return x;
}

/**
 * Safe JSON helpers -- never throw. parse() validates with an optional guard
 * so callers can lock the type at the boundary.
 */
export const safeJSON = {
  parse<T = unknown>(input: string, guard?: (v: unknown) => v is T, op?: string): Result<T> {
    if (typeof input !== 'string') {
      return err(toDexError({ code: 'E_JSON_INPUT', message: 'safeJSON.parse expects a string' }, op));
    }
    try {
      const v = JSON.parse(input) as unknown;
      if (guard && !guard(v)) {
        return err(toDexError({ code: 'E_JSON_SHAPE', message: 'parsed JSON failed runtime guard' }, op));
      }
      return ok(v as T);
    } catch (e) {
      return err(toDexError(e, op, 'E_JSON_PARSE'));
    }
  },

  stringify(value: unknown, space?: number, op?: string): Result<string> {
    try {
      const out = JSON.stringify(value, replacer(), space);
      if (typeof out !== 'string') {
        return err(toDexError({ code: 'E_JSON_STRINGIFY', message: 'value not serializable' }, op));
      }
      return ok(out);
    } catch (e) {
      return err(toDexError(e, op, 'E_JSON_STRINGIFY'));
    }
  },
};

/** Replacer that drops circular refs and BigInt safely. */
function replacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_k: string, v: unknown) => {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v as object)) return '[circular]';
      seen.add(v as object);
    }
    return v;
  };
}
