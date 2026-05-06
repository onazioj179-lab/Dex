// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SecureIpcRouter -- central registration point for all DEX IPC handlers.
 *
 * Every channel registered through this router gets:
 *   1. Structured error envelopes via safeHandler (never raw throws to renderer)
 *   2. Per-sender rate limiting via ipcRateLimiter
 *   3. Path sanitization for any handler flagged `requiresPath: true`
 *   4. Structured logging on failure
 *   5. A typed channel manifest (auditable, no stray ipcMain.handle calls)
 *
 * W2 #76-90: IPC hardening, rate limiting, path validation gating
 *
 * Usage in main.ts (or controller init):
 *   import { secureIpcRouter } from './security/SecureIpcRouter';
 *   secureIpcRouter.register('myChannel:doThing', handler, { rateLimit: { maxCalls: 30, windowMs: 60000 } });
 *   secureIpcRouter.mount(); // call once after all registrations
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import * as log from 'electron-log';
import { safeHandler, envelopeOk, envelopeErr, type SafeHandlerOptions } from '../../shared/safeIpc';
import { toDexError, type DexError } from '../../shared/result';
import { PathValidator } from './PathValidator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  maxCalls: number;
  windowMs: number;
}

export interface ChannelOptions<I = unknown> {
  /** Optional rate limit override for this specific channel. */
  rateLimit?: RateLimitConfig;
  /** Validate payload with this guard before calling handler. */
  guard?: (v: unknown) => v is I;
  /** If true, any string field named `path`, `filePath`, or `src`/`dest`
   *  in the payload will be validated through PathValidator before the
   *  handler sees it. */
  requiresPath?: boolean;
}

type HandlerFn<I, O> = (input: I, event: IpcMainInvokeEvent) => Promise<O> | O;

interface Registration {
  channel: string;
  handler: HandlerFn<unknown, unknown>;
  options: ChannelOptions;
  mounted: boolean;
}

// ---------------------------------------------------------------------------
// Rate-limit state (per channel + per sender)
// ---------------------------------------------------------------------------

interface RLBucket { timestamps: number[] }

class InternalRateLimiter {
  private readonly _buckets = new Map<string, RLBucket>();
  private readonly _defaults: RateLimitConfig = { maxCalls: 120, windowMs: 60_000 };

  check(channel: string, senderId: number, cfg: RateLimitConfig = this._defaults): boolean {
    const key = `${channel}:${senderId}`;
    const now = Date.now();
    if (!this._buckets.has(key)) this._buckets.set(key, { timestamps: [] });
    const bucket = this._buckets.get(key)!;
    // evict expired
    bucket.timestamps = bucket.timestamps.filter(t => now - t < cfg.windowMs);
    if (bucket.timestamps.length >= cfg.maxCalls) return false;
    bucket.timestamps.push(now);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Path extraction / validation middleware
// ---------------------------------------------------------------------------

const PATH_KEYS = ['path', 'filePath', 'src', 'dest', 'source', 'target', 'directory', 'dir'] as const;

function sanitizePaths(input: unknown): void {
  if (!input || typeof input !== 'object') return;
  const obj = input as Record<string, unknown>;
  for (const key of PATH_KEYS) {
    const val = obj[key];
    if (typeof val === 'string') {
      // Will throw on invalid path — safeHandler catches and converts to envelope err
      obj[key] = PathValidator.validatePath(val);
    }
  }
}

// ---------------------------------------------------------------------------
// SecureIpcRouter
// ---------------------------------------------------------------------------

export class SecureIpcRouter {
  private readonly _registry = new Map<string, Registration>();
  private readonly _rl = new InternalRateLimiter();
  private _mounted = false;

  /**
   * Register a channel handler.
   * Can be called before or after `mount()`. If called after mount it is
   * mounted immediately.
   */
  register<I, O>(
    channel: string,
    handler: HandlerFn<I, O>,
    options: ChannelOptions<I> = {},
  ): this {
    if (this._registry.has(channel)) {
      log.warn(`[SecureIpcRouter] duplicate registration for "${channel}" — ignoring`);
      return this;
    }

    const reg: Registration = {
      channel,
      handler: handler as HandlerFn<unknown, unknown>,
      options: options as ChannelOptions,
      mounted: false,
    };
    this._registry.set(channel, reg);

    if (this._mounted) this._mountOne(reg);
    return this;
  }

  /**
   * Mount all registered handlers onto ipcMain.
   * Call once after all register() calls.
   */
  mount(): this {
    if (this._mounted) return this;
    this._mounted = true;
    for (const reg of this._registry.values()) {
      if (!reg.mounted) this._mountOne(reg);
    }
    log.info(`[SecureIpcRouter] mounted ${this._registry.size} channels`);
    return this;
  }

  private _mountOne(reg: Registration): void {
    reg.mounted = true;
    const { channel, handler, options } = reg;

    const logFn: SafeHandlerOptions<unknown>['log'] = (level, msg, data) => {
      (level === 'error' ? log.error : log.warn)(`[ipc:${channel}] ${msg}`, data ?? '');
    };

    const wrappedFn = safeHandler(
      channel,
      async (input: unknown) => handler(input, null as unknown as IpcMainInvokeEvent),
      { guard: options.guard, log: logFn },
    );

    ipcMain.handle(channel, async (event, input: unknown) => {
      // 1. Rate limiting
      const senderId = event.sender?.id ?? 0;
      if (!this._rl.check(channel, senderId, options.rateLimit)) {
        const e: DexError = { code: 'E_RATE_LIMITED', message: `Rate limit exceeded for "${channel}"`, op: channel };
        log.warn(`[SecureIpcRouter] rate limited "${channel}" sender=${senderId}`);
        return envelopeErr(channel, e);
      }

      // 2. Path sanitization (mutates input fields in-place)
      if (options.requiresPath) {
        try { sanitizePaths(input); }
        catch (pathErr) {
          const e = toDexError(pathErr, channel, 'E_PATH_DENIED');
          log.warn(`[SecureIpcRouter] path rejected on "${channel}"`, { message: e.message });
          return envelopeErr(channel, e);
        }
      }

      // 3. Delegate to safeHandler (guard + try/catch + envelope)
      return wrappedFn(input);
    });
  }

  /** Get all registered channel names (for audit). */
  channels(): string[] {
    return [...this._registry.keys()].sort();
  }

  /** Check registration count for monitoring. */
  get size(): number { return this._registry.size; }
}

/** Shared router instance. Import and call register() from controllers. */
export const secureIpcRouter = new SecureIpcRouter();
