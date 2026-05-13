// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Reusable test fixture builders (T8 test infra).
 *
 * Deterministic id sequence + per-builder defaults, override-friendly via
 * partial patch. Reset between tests with `factoryReset()`.
 */

let _seq = 1;
export function factoryReset(): void { _seq = 1; }
export function nextId(prefix = 'id'): string { return `${prefix}-${_seq++}`; }

export interface UserFixture { id: string; name: string; email: string; role: 'admin' | 'user'; }
export function makeUser(patch: Partial<UserFixture> = {}): UserFixture {
  const id = patch.id ?? nextId('user');
  return { id, name: `User ${id}`, email: `${id}@dex.test`, role: 'user', ...patch };
}

export interface DocFixture { id: string; title: string; ownerId: string; sizeBytes: number; }
export function makeDoc(patch: Partial<DocFixture> = {}): DocFixture {
  const id = patch.id ?? nextId('doc');
  return { id, title: `Doc ${id}`, ownerId: 'user-1', sizeBytes: 1024, ...patch };
}

export interface NotificationFixture { id: string; title: string; body: string; ts: number; level: 'info' | 'warn' | 'error'; }
export function makeNotification(patch: Partial<NotificationFixture> = {}): NotificationFixture {
  const id = patch.id ?? nextId('note');
  return { id, title: 'Notification', body: 'hello', ts: 1_700_000_000_000, level: 'info', ...patch };
}

/** Build N items via a factory, with optional per-index overrides. */
export function makeMany<T>(n: number, factory: (i: number) => T): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(factory(i));
  return out;
}
