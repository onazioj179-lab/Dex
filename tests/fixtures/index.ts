// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { vi } from 'vitest';

export function createMockController() {
  const handlers = new Map<string, Function>();
  const listeners = new Map<string, Function>();

  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        handlers.set(channel, handler);
      }),
      on: vi.fn((channel: string, handler: Function) => {
        listeners.set(channel, handler);
      }),
      removeHandler: vi.fn(),
      removeAllListeners: vi.fn(),
    },
    getHandler: (channel: string) => handlers.get(channel),
    getListener: (channel: string) => listeners.get(channel),
    invokeHandler: async (channel: string, event: any, ...args: any[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for channel: ${channel}`);
      return handler(event, ...args);
    },
    sendToListener: (channel: string, event: any, ...args: any[]) => {
      const listener = listeners.get(channel);
      if (!listener) throw new Error(`No listener for channel: ${channel}`);
      return listener(event, ...args);
    },
  };
}

export function createMockEvent(senderId = 1) {
  return {
    sender: {
      id: senderId,
      send: vi.fn(),
    },
    returnValue: undefined as any,
  };
}

export function createMockStore(initialState: Record<string, any> = {}) {
  const mockStorage: Record<string, string> = {};

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
      clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
    },
    writable: true,
    configurable: true,
  });

  return { mockStorage };
}
