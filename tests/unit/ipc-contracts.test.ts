// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  IpcContractRegistry,
  schema,
  isValidChannelName,
  type IpcContract,
} from '../../src/shared/ipc/contracts/registry';
import {
  createCanonicalRegistry,
  CANONICAL_CONTRACTS,
  FILE_READ,
  FILE_WRITE,
} from '../../src/shared/ipc/contracts/canonical';

describe('IpcContractRegistry', () => {
  it('accepts only valid channel names', () => {
    expect(isValidChannelName('files:read')).toBe(true);
    expect(isValidChannelName('window:minimize')).toBe(true);
    expect(isValidChannelName('foo:bar:baz')).toBe(true);
    expect(isValidChannelName('Files:Read')).toBe(false);
    expect(isValidChannelName('files')).toBe(false);
    expect(isValidChannelName('files:')).toBe(false);
    expect(isValidChannelName(':files')).toBe(false);
  });

  it('register/get/has/list/size', () => {
    const r = new IpcContractRegistry();
    expect(r.size()).toBe(0);
    r.register(FILE_READ);
    expect(r.size()).toBe(1);
    expect(r.has('files:read')).toBe(true);
    expect(r.get('files:read')).toBe(FILE_READ);
    expect(r.list()).toContain(FILE_READ);
  });

  it('rejects duplicate channel registration', () => {
    const r = new IpcContractRegistry();
    r.register(FILE_READ);
    expect(() => r.register(FILE_READ)).toThrow(/already registered/);
  });

  it('rejects malformed channel names', () => {
    const r = new IpcContractRegistry();
    const bad: IpcContract<unknown, unknown> = {
      ...FILE_READ,
      channel: 'BADNAME',
    } as unknown as IpcContract<unknown, unknown>;
    expect(() => r.register(bad)).toThrow(/Invalid IPC channel name/);
  });

  it('validateRequest/validateResponse enforce schemas', () => {
    const r = new IpcContractRegistry();
    r.register(FILE_READ);
    expect(r.validateRequest('files:read', { path: '/tmp/x' }).ok).toBe(true);
    expect(r.validateRequest('files:read', { path: 123 }).ok).toBe(false);
    expect(r.validateRequest('unknown:channel', {}).ok).toBe(false);
    expect(r.validateResponse('files:read', { content: 'hi', bytes: 2 }).ok).toBe(true);
    expect(r.validateResponse('files:read', { content: 'hi' }).ok).toBe(false);
  });

  it('null request/response means no payload', () => {
    const r = new IpcContractRegistry();
    const ping: IpcContract<undefined, undefined> = {
      channel: 'system:ping',
      direction: 'renderer-to-main',
      request: null,
      response: null,
      rate: 'background',
      permission: 'public',
      version: 1,
    };
    r.register(ping);
    expect(r.validateRequest('system:ping', undefined).ok).toBe(true);
    expect(r.validateRequest('system:ping', {}).ok).toBe(false);
    expect(r.validateResponse('system:ping', undefined).ok).toBe(true);
  });

  it('schema combinators', () => {
    const userSchema = schema.object<{ id: string; tags: string[]; nick?: string }>({
      id: schema.string,
      tags: schema.array(schema.string),
      nick: schema.optional(schema.string),
    });
    expect(userSchema({ id: 'a', tags: [] })).toBe(true);
    expect(userSchema({ id: 'a', tags: ['x'], nick: 'b' })).toBe(true);
    expect(userSchema({ id: 'a', tags: [1] })).toBe(false);
    expect(userSchema({ id: 1, tags: [] })).toBe(false);
    expect(userSchema(null)).toBe(false);
    expect(userSchema([])).toBe(false);
  });

  it('canonical registry seeds every canonical contract', () => {
    const r = createCanonicalRegistry();
    expect(r.size()).toBe(CANONICAL_CONTRACTS.length);
    for (const c of CANONICAL_CONTRACTS) {
      expect(r.has(c.channel)).toBe(true);
    }
  });

  it('canonical contracts have unique channel names', () => {
    const seen = new Set<string>();
    for (const c of CANONICAL_CONTRACTS) {
      expect(seen.has(c.channel)).toBe(false);
      seen.add(c.channel);
    }
  });

  it('FILE_WRITE schema rejects missing fields', () => {
    expect(FILE_WRITE.request!({ path: '/x', content: 'y' })).toBe(true);
    expect(FILE_WRITE.request!({ path: '/x' })).toBe(false);
    expect(FILE_WRITE.request!({ content: 'y' })).toBe(false);
  });
});
