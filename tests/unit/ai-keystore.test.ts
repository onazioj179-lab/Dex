// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  obfuscate, deobfuscate, setApiKey, getApiKey, removeApiKey, hasApiKey, configuredProviders,
} from '../../src/renderer/uki/keystore';

beforeEach(() => localStorage.clear());

describe('AI keystore', () => {
  it('obfuscation round-trips and is not plaintext', () => {
    const key = 'sk-test-1234567890';
    const stored = obfuscate(key);
    expect(stored).not.toBe(key);
    expect(stored).not.toContain('sk-test');
    expect(deobfuscate(stored)).toBe(key);
  });

  it('stores and retrieves a key per provider', () => {
    setApiKey('openai', 'sk-abc');
    expect(getApiKey('openai')).toBe('sk-abc');
    expect(hasApiKey('openai')).toBe(true);
    expect(getApiKey('anthropic')).toBeNull();
    expect(hasApiKey('anthropic')).toBe(false);
  });

  it('does not persist the raw key in localStorage', () => {
    setApiKey('openai', 'sk-secret');
    expect(localStorage.getItem('dex-uki-key-openai')).not.toContain('sk-secret');
  });

  it('removes keys (and empty set clears)', () => {
    setApiKey('openai', 'x');
    removeApiKey('openai');
    expect(getApiKey('openai')).toBeNull();
    setApiKey('openai', '');
    expect(hasApiKey('openai')).toBe(false);
  });

  it('lists configured providers', () => {
    setApiKey('openai', 'a');
    setApiKey('anthropic', 'b');
    expect(configuredProviders().sort()).toEqual(['anthropic', 'openai']);
  });
});
