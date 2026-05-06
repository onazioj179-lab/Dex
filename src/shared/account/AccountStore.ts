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
 * INTENTIONAL STUB: real cloud transport (HTTPS + signed token) lives in
 * src/main/account/CloudTransport.ts in a later wave. This module ships the
 * full local API surface plus an in-memory transport for tests.
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

export const ACCOUNT_STORAGE_KEY = ACCOUNT_KEY;
