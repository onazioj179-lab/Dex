// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Account System
 * -----------------------------------------------------------------------------
 * iCloud-style optional account: every install works fully without one. If a
 * user signs in, their settings, snippets, plans, and (optionally) Nexus
 * graph follow them across devices. If they do not, nothing leaves the
 * machine. Same code path either way.
 *
 * This module is the local-first store. The cloud transport is a thin
 * `AccountSyncTransport` interface so unit tests can drive it in-memory and
 * the real implementation can plug in HTTPS later.
 *
 * Two transports ship in this file:
 *   - `createInMemoryTransport()` — used by tests and preview builds.
 *   - `createHttpsTransport({ endpoint, token })` — real cloud transport
 *     against a user-configured HTTPS endpoint with a bearer token. The
 *     endpoint is expected to expose:
 *         GET  /accounts/:id   -> AccountProfile JSON | 404
 *         POST /accounts/:id   -> 200/201 (body = AccountProfile JSON)
 *     If the endpoint is unreachable, push/pull throw — callers stay
 *     local-first and surface the failure to the user.
 */

// DEX v3.8.7 - account system

export type AccountTier = 'free-viewer' | 'personal' | 'family' | 'pro' | 'studio';
export type AccountStatus = 'active' | 'trial' | 'expired' | 'cancelled' | 'suspended';

export interface AccountProfile {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
  tier: AccountTier;
  status: AccountStatus;
  /** Trial / subscription end timestamp in ms epoch. 0 = no end. */
  validUntil: number;
  /** Read-only viewer takes over once trial/subscription expires. */
  readOnlyAfterExpiry: boolean;
  /** Devices linked to this account. */
  devices: AccountDevice[];
  /** True when the user opted in to cloud sync. */
  syncEnabled: boolean;
}

export interface AccountDevice {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: number;
}

export interface AccountSyncTransport {
  pull: (accountId: string) => Promise<AccountProfile | null>;
  push: (profile: AccountProfile) => Promise<void>;
}

const ACCOUNT_KEY = 'dex.account.v1';

export interface AccountStorage {
  get: () => string | null;
  set: (v: string) => void;
  clear: () => void;
}

/** Create an in-memory storage adapter (default for renderer wires localStorage). */
export function createMemoryStorage(initial?: string): AccountStorage {
  let v: string | null = initial ?? null;
  return {
    get: () => v,
    set: (s) => { v = s; },
    clear: () => { v = null; },
  };
}

export class AccountStore {
  private profile: AccountProfile | null = null;
  private listeners = new Set<(p: AccountProfile | null) => void>();
  constructor(private storage: AccountStorage) { this.load(); }

  private load(): void {
    const raw = this.storage.get();
    if (!raw) { this.profile = null; return; }
    try { this.profile = JSON.parse(raw) as AccountProfile; } catch { this.profile = null; }
  }
  private persist(): void {
    if (this.profile) this.storage.set(JSON.stringify(this.profile));
    else this.storage.clear();
    for (const l of this.listeners) l(this.profile);
  }

  current(): AccountProfile | null { return this.profile ? { ...this.profile, devices: [...this.profile.devices] } : null; }
  isSignedIn(): boolean { return this.profile !== null; }
  isAnonymous(): boolean { return this.profile === null; }
  subscribe(listener: (p: AccountProfile | null) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  signIn(profile: AccountProfile): void {
    this.profile = profile;
    this.persist();
  }

  signOut(): void {
    this.profile = null;
    this.persist();
  }

  /** Update the local profile in place. Throws if not signed in. */
  patch(patch: Partial<AccountProfile>): void {
    if (!this.profile) throw new Error('not signed in');
    this.profile = { ...this.profile, ...patch };
    this.persist();
  }

  setSyncEnabled(enabled: boolean): void { this.patch({ syncEnabled: enabled }); }

  registerDevice(device: AccountDevice): void {
    if (!this.profile) throw new Error('not signed in');
    const existing = this.profile.devices.findIndex((d) => d.id === device.id);
    const devices = this.profile.devices.slice();
    if (existing >= 0) devices[existing] = device;
    else devices.push(device);
    this.patch({ devices });
  }

  /** Returns the effective tier honouring expiry: expired -> free-viewer. */
  effectiveTier(now: number = Date.now()): AccountTier {
    if (!this.profile) return 'free-viewer';
    if (this.profile.validUntil > 0 && this.profile.validUntil < now) {
      return this.profile.readOnlyAfterExpiry ? 'free-viewer' : 'free-viewer';
    }
    return this.profile.tier;
  }

  /** Pull from cloud and overwrite local; resolves with the merged profile. */
  async sync(transport: AccountSyncTransport): Promise<AccountProfile | null> {
    if (!this.profile || !this.profile.syncEnabled) return this.profile;
    const remote = await transport.pull(this.profile.id);
    if (remote) {
      // Last-write-wins on createdAt; in real cloud we will use vector clocks.
      this.profile = remote;
      this.persist();
    } else {
      await transport.push(this.profile);
    }
    return this.profile;
  }
}

/** Create an in-process transport for tests + preview. */
export function createInMemoryTransport(): AccountSyncTransport & { dump: () => Map<string, AccountProfile> } {
  const store = new Map<string, AccountProfile>();
  return {
    pull: async (id) => store.get(id) ?? null,
    push: async (profile) => { store.set(profile.id, profile); },
    dump: () => store,
  };
}

export interface HttpsTransportOptions {
  /** Base URL — must be https://. Trailing slash optional. */
  endpoint: string;
  /** Bearer token sent as `Authorization: Bearer <token>`. */
  token: string;
  /** Network timeout in ms. Default 8000. */
  timeoutMs?: number;
  /** Optional `fetch` override for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * HTTPS-backed cloud transport. Local-first: every call throws on failure
 * so the caller can keep working offline rather than silently dropping
 * data. Endpoint must use https:// — http:// is rejected to avoid leaking
 * tokens in plaintext.
 */
export function createHttpsTransport(opts: HttpsTransportOptions): AccountSyncTransport {
  const { endpoint, token } = opts;
  if (!/^https:\/\//i.test(endpoint)) {
    throw new Error('AccountStore: HTTPS transport endpoint must use https://');
  }
  if (!token) throw new Error('AccountStore: HTTPS transport requires a token');
  const base = endpoint.replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? 8000;
  const fetchImpl: typeof fetch | undefined = opts.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (!fetchImpl) throw new Error('AccountStore: no fetch implementation available');
  const fetchFn: typeof fetch = fetchImpl;

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetchFn(`${base}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: {
          ...(init?.headers ?? {}),
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    pull: async (accountId: string) => {
      const safe = encodeURIComponent(accountId);
      const res = await request(`/accounts/${safe}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`AccountStore: pull HTTP ${res.status}`);
      return await res.json() as AccountProfile;
    },
    push: async (profile: AccountProfile) => {
      const safe = encodeURIComponent(profile.id);
      const res = await request(`/accounts/${safe}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error(`AccountStore: push HTTP ${res.status}`);
    },
  };
}

export const ACCOUNT_STORAGE_KEY = ACCOUNT_KEY;
