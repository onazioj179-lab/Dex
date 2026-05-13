// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Async retry with exponential backoff + jitter.
 * Used by network fetches, plugin updater, license check, sync.
 */

export interface RetryOptions {
  retries?: number;        // default 3
  baseDelayMs?: number;    // default 250
  maxDelayMs?: number;     // default 5000
  jitter?: boolean;        // default true
  onRetry?: (attempt: number, err: unknown) => void;
  /** Return false to abort early (treated as fatal). */
  shouldRetry?: (err: unknown) => boolean;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 250;
  const max = opts.maxDelayMs ?? 5000;
  const jitter = opts.jitter ?? true;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (opts.shouldRetry && !opts.shouldRetry(err)) throw err;
      if (attempt === retries) break;
      opts.onRetry?.(attempt + 1, err);
      const exp = Math.min(max, base * Math.pow(2, attempt));
      const delay = jitter ? Math.floor(Math.random() * exp) : exp;
      await new Promise<void>((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}
