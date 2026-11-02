// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  hydrateKeystore, setApiKey, getApiKey, removeApiKey, configuredProviders,
  isSecureKeystore, obfuscate, _resetKeystoreForTests,
} from '../../src/renderer/uki/keystore';

/** In-memory stand-in for the native `secrets:*` channels. */
function fakeSecretStore(opts: { available?: boolean; failSet?: boolean } = {}) {
  const store = new Map<string, string>();
  const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
    const [name, value] = args as [string, string];
    switch (channel) {
      case 'secrets:status': return { available: opts.available !== false };
      case 'secrets:list': return [...store.keys()];
      case 'secrets:get': return store.get(name) ?? null;
      case 'secrets:set': if (opts.failSet) return { success: false }; store.set(name, value); return { success: true };
      case 'secrets:delete': store.delete(name); return { success: true };
      default: return null;
    }
  };
  return { store, invoke };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  _resetKeystoreForTests();
});

describe('AI key store', () => {
  it('migrates legacy localStorage keys into the secure store, then removes them', async () => {
    localStorage.setItem('dex-uki-key-openai', obfuscate('sk-legacy'));
    const { store, invoke } = fakeSecretStore();
    await hydrateKeystore(invoke);
    expect(isSecureKeystore()).toBe(true);
    expect(store.get('uki-provider:openai')).toBe('sk-legacy');
    expect(localStorage.getItem('dex-uki-key-openai')).toBeNull();
    expect(getApiKey('openai')).toBe('sk-legacy');
    expect(configuredProviders()).toEqual(['openai']);
  });

  it('keeps the legacy copy if the secure write fails', async () => {
    localStorage.setItem('dex-uki-key-openai', obfuscate('sk-legacy'));
    const { invoke } = fakeSecretStore({ failSet: true });
    await hydrateKeystore(invoke);
    expect(localStorage.getItem('dex-uki-key-openai')).not.toBeNull();
    expect(getApiKey('openai')).toBe('sk-legacy');
  });

  it('new keys go to the secure store, not localStorage', async () => {
    const { store, invoke } = fakeSecretStore();
    await hydrateKeystore(invoke);
    setApiKey('anthropic', 'sk-ant-1');
    await flush();
    expect(store.get('uki-provider:anthropic')).toBe('sk-ant-1');
    expect(localStorage.getItem('dex-uki-key-anthropic')).toBeNull();
    removeApiKey('anthropic');
    await flush();
    expect(store.has('uki-provider:anthropic')).toBe(false);
    expect(getApiKey('anthropic')).toBeNull();
  });

  it('falls back to the legacy path when no secure store exists', async () => {
    await hydrateKeystore(fakeSecretStore({ available: false }).invoke);
    expect(isSecureKeystore()).toBe(false);
    setApiKey('google', 'g-key');
    expect(localStorage.getItem('dex-uki-key-google')).not.toBe('g-key'); // obfuscated, never plain
    expect(getApiKey('google')).toBe('g-key');
  });
});
