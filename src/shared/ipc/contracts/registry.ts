// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * IPC Contract Registry. Single source of truth for every IPC channel: its
 * direction, payload schemas, rate-limit category, permission scope, and
 * version. New channels MUST be declared here before a handler is
 * registered.
 *
 * Implements ADR 0004 (IPC contract formalization). Pairs with the
 * runtime governance constants in `src/shared/governance/index.ts`.
 *
 * This file intentionally does not import from main or renderer code so
 * both processes can consume it.
 */

import type { IpcRateCategory } from '../../governance';

export type IpcDirection = 'renderer-to-main' | 'main-to-renderer' | 'bidirectional';

export type IpcPermissionScope =
  | 'public'
  | 'workspace.read'
  | 'workspace.write'
  | 'system.read'
  | 'system.write'
  | 'native'
  | 'admin';

/**
 * Lightweight runtime predicate used to validate IPC payloads at the
 * trust boundary. Keep predicates pure and synchronous.
 */
export type IpcSchema<T> = (value: unknown) => value is T;

export interface IpcContract<TRequest = unknown, TResponse = unknown> {
  /** Canonical channel name. Lowercase, colon-namespaced, e.g. `files:list`. */
  readonly channel: string;
  /** Channel direction. */
  readonly direction: IpcDirection;
  /** Optional human-readable description. */
  readonly description?: string;
  /** Schema validator for the request payload. `null` means no payload. */
  readonly request: IpcSchema<TRequest> | null;
  /** Schema validator for the response payload. `null` means fire-and-forget. */
  readonly response: IpcSchema<TResponse> | null;
  /** Rate-limit category. Maps to a `TokenBucket` budget. */
  readonly rate: IpcRateCategory;
  /** Required permission scope. */
  readonly permission: IpcPermissionScope;
  /**
   * Schema version. Bump when the payload shape changes in a
   * backwards-incompatible way and publish under a new channel suffixed
   * `:v2` (etc.) per ADR 0004.
   */
  readonly version: number;
  /**
   * If the contract supersedes a prior channel, the prior channel name.
   * Used by the deprecation auditor.
   */
  readonly supersedes?: string;
}

/** Type helpers to extract request/response types from a contract. */
export type IpcRequestOf<C> = C extends IpcContract<infer R, unknown> ? R : never;
export type IpcResponseOf<C> = C extends IpcContract<unknown, infer R> ? R : never;

interface RegistryEntry {
  contract: IpcContract<unknown, unknown>;
  registeredAt: number;
}

/**
 * Process-local IPC contract registry. The main and renderer processes each
 * keep their own instance; declaring the same channel in both processes is
 * the explicit cross-boundary handshake.
 */
export class IpcContractRegistry {
  private entries = new Map<string, RegistryEntry>();

  register<TReq, TRes>(contract: IpcContract<TReq, TRes>, now = Date.now()): void {
    if (!isValidChannelName(contract.channel)) {
      throw new Error(`Invalid IPC channel name: ${contract.channel}`);
    }
    if (this.entries.has(contract.channel)) {
      throw new Error(`IPC channel already registered: ${contract.channel}`);
    }
    this.entries.set(contract.channel, {
      contract: contract as IpcContract<unknown, unknown>,
      registeredAt: now,
    });
  }

  get(channel: string): IpcContract<unknown, unknown> | null {
    return this.entries.get(channel)?.contract ?? null;
  }

  has(channel: string): boolean {
    return this.entries.has(channel);
  }

  list(): readonly IpcContract<unknown, unknown>[] {
    return Array.from(this.entries.values()).map((e) => e.contract);
  }

  size(): number {
    return this.entries.size;
  }

  /**
   * Validate a payload against a registered request schema. Returns
   * `{ ok: true }` when valid; `{ ok: false, reason }` otherwise. Channels
   * with `request: null` accept only `undefined`.
   */
  validateRequest(channel: string, payload: unknown): { ok: true } | { ok: false; reason: string } {
    const contract = this.get(channel);
    if (!contract) return { ok: false, reason: `unknown channel: ${channel}` };
    if (contract.request === null) {
      return payload === undefined
        ? { ok: true }
        : { ok: false, reason: `channel ${channel} expects no payload` };
    }
    return contract.request(payload)
      ? { ok: true }
      : { ok: false, reason: `payload failed schema for ${channel}` };
  }

  validateResponse(channel: string, payload: unknown): { ok: true } | { ok: false; reason: string } {
    const contract = this.get(channel);
    if (!contract) return { ok: false, reason: `unknown channel: ${channel}` };
    if (contract.response === null) {
      return payload === undefined
        ? { ok: true }
        : { ok: false, reason: `channel ${channel} expects no response payload` };
    }
    return contract.response(payload)
      ? { ok: true }
      : { ok: false, reason: `response failed schema for ${channel}` };
  }

  /** Returns channels that declare `supersedes`. Used by the audit script. */
  deprecations(): readonly { current: string; deprecated: string }[] {
    const out: { current: string; deprecated: string }[] = [];
    for (const e of this.entries.values()) {
      if (e.contract.supersedes) {
        out.push({ current: e.contract.channel, deprecated: e.contract.supersedes });
      }
    }
    return out;
  }
}

const CHANNEL_NAME = /^[a-z][a-z0-9]*(?::[a-z0-9][a-z0-9-]*)+$/;

export function isValidChannelName(name: string): boolean {
  return typeof name === 'string' && CHANNEL_NAME.test(name);
}

/** Convenience schema combinators kept tiny and dependency-free. */
export const schema = {
  any: ((value: unknown): value is unknown => value !== undefined) as IpcSchema<unknown>,
  string: ((value: unknown): value is string => typeof value === 'string') as IpcSchema<string>,
  number: ((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)) as IpcSchema<number>,
  boolean: ((value: unknown): value is boolean => typeof value === 'boolean') as IpcSchema<boolean>,
  optional<T>(inner: IpcSchema<T>): IpcSchema<T | undefined> {
    return ((value: unknown): value is T | undefined =>
      value === undefined || inner(value)) as IpcSchema<T | undefined>;
  },
  array<T>(inner: IpcSchema<T>): IpcSchema<T[]> {
    return ((value: unknown): value is T[] =>
      Array.isArray(value) && value.every((v) => inner(v))) as IpcSchema<T[]>;
  },
  object<T extends object>(shape: { [K in keyof T]: IpcSchema<T[K]> }): IpcSchema<T> {
    return ((value: unknown): value is T => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(shape) as (keyof T)[]) {
        if (!shape[key]!(obj[key as string])) return false;
      }
      return true;
    }) as IpcSchema<T>;
  },
};
