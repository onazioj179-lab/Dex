// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX CORE UNIT TESTS - Storage Manager
 * ===========================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage manager module structure
const createStorageManager = () => {
  const store = new Map<string, any>();
  
  return {
    get: vi.fn((key: string, defaultValue?: any) => store.get(key) ?? defaultValue),
    set: vi.fn((key: string, value: any) => { store.set(key, value); }),
    delete: vi.fn((key: string) => store.delete(key)),
    has: vi.fn((key: string) => store.has(key)),
    clear: vi.fn(() => store.clear()),
    getAll: vi.fn(() => Object.fromEntries(store)),
    _store: store,
  };
};

describe('StorageManager', () => {
  let storageManager: ReturnType<typeof createStorageManager>;

  beforeEach(() => {
    storageManager = createStorageManager();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      storageManager.set('testKey', 'testValue');
      expect(storageManager.get('testKey')).toBe('testValue');
    });

    it('should return default value for missing keys', () => {
      expect(storageManager.get('missingKey', 'default')).toBe('default');
    });

    it('should delete values', () => {
      storageManager.set('deleteMe', 'value');
      expect(storageManager.has('deleteMe')).toBe(true);
      storageManager.delete('deleteMe');
      expect(storageManager.has('deleteMe')).toBe(false);
    });

    it('should clear all values', () => {
      storageManager.set('key1', 'value1');
      storageManager.set('key2', 'value2');
      storageManager.clear();
      expect(storageManager._store.size).toBe(0);
    });

    it('should store complex objects', () => {
      const complexObj = {
        name: 'Test',
        nested: { value: 123 },
        array: [1, 2, 3],
      };
      storageManager.set('complex', complexObj);
      expect(storageManager.get('complex')).toEqual(complexObj);
    });
  });

  describe('Type Safety', () => {
    it('should handle null values', () => {
      storageManager.set('nullKey', null);
      // Storage typically converts null to undefined or stores it as is
      const result = storageManager.get('nullKey');
      expect(result === null || result === undefined).toBe(true);
    });

    it('should handle undefined with default', () => {
      expect(storageManager.get('undefinedKey', 'fallback')).toBe('fallback');
    });

    it('should handle boolean values', () => {
      storageManager.set('boolTrue', true);
      storageManager.set('boolFalse', false);
      expect(storageManager.get('boolTrue')).toBe(true);
      expect(storageManager.get('boolFalse')).toBe(false);
    });

    it('should handle numeric values', () => {
      storageManager.set('int', 42);
      storageManager.set('float', 3.14);
      storageManager.set('negative', -100);
      expect(storageManager.get('int')).toBe(42);
      expect(storageManager.get('float')).toBe(3.14);
      expect(storageManager.get('negative')).toBe(-100);
    });
  });
});
