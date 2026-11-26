// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import type { TeardownFn } from '../../../shared/disposable';

type UnknownFn = (...args: any[]) => any;
type EventHandler = (...args: unknown[]) => void;

interface BridgeShape {
  invoke?: UnknownFn;
  send?: UnknownFn;
  on?: UnknownFn;
  off?: UnknownFn;
  removeListener?: UnknownFn;
  ipcRenderer?: BridgeShape;
}

function bridges(): { dex?: BridgeShape; electron?: BridgeShape; ipcRenderer?: BridgeShape } {
  const root = globalThis as typeof globalThis & {
    dex?: BridgeShape;
    electron?: BridgeShape;
    ipcRenderer?: BridgeShape;
  };
  return {
    dex: root.dex,
    electron: root.electron,
    ipcRenderer: root.electron?.ipcRenderer ?? root.ipcRenderer,
  };
}

type FileOperation = 'files:copy' | 'files:move' | 'files:rename' | 'files:trash' | 'files:delete' | 'files:mkdir';

export async function invokeFileOperation(channel: FileOperation, ...paths: string[]): Promise<void> {
  const result = await invokePlatformIpc<{ success: boolean; error?: string } | boolean>(channel, ...paths);
  if (result === true || (result && typeof result === 'object' && result.success)) return;
  const reason = result && typeof result === 'object' ? result.error : undefined;
  throw new Error(reason || 'The file operation could not be completed.');
}

/** Invoke one backend channel without exposing the active desktop shell. */
export async function invokePlatformIpc<T = unknown>(channel: string, ...args: unknown[]): Promise<T | null> {
  const { dex, electron, ipcRenderer } = bridges();
  const invoke = ipcRenderer?.invoke ?? electron?.invoke ?? dex?.invoke;
  if (typeof invoke !== 'function') return null;
  try {
    return await invoke(channel, ...args) as T;
  } catch {
    return null;
  }
}

/** Send a fire-and-forget backend message through the active shell. */
export function sendPlatformIpc(channel: string, ...args: unknown[]): void {
  const { dex, electron, ipcRenderer } = bridges();
  const send = ipcRenderer?.send;
  if (typeof send === 'function') {
    send(channel, ...args);
    return;
  }
  const invoke = electron?.invoke ?? dex?.invoke;
  if (typeof invoke === 'function') {
    try {
      const result = invoke(channel, ...args);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // The backend may already be shutting down.
    }
  }
}

/**
 * Subscribe to a backend push event and receive payload arguments only.
 * Electron's hidden IpcRendererEvent and Tauri's payload envelope are both
 * stripped at this boundary. The returned teardown is always safe to call.
 */
export function subscribePlatformIpc(channel: string, handler: EventHandler): TeardownFn {
  const { dex, electron, ipcRenderer } = bridges();

  if (typeof ipcRenderer?.on === 'function') {
    const wrapped = (_event: unknown, ...args: unknown[]) => handler(...args);
    ipcRenderer.on(channel, wrapped);
    return () => {
      try {
        const off = ipcRenderer.off ?? ipcRenderer.removeListener;
        off?.call(ipcRenderer, channel, wrapped);
      } catch {
        // The shell may already be gone.
      }
    };
  }

  const bridge = typeof electron?.on === 'function' ? electron : dex;
  if (typeof bridge?.on !== 'function') return () => {};
  const wrapped = (...args: unknown[]) => handler(...args);
  bridge.on(channel, wrapped);
  return () => {
    try {
      const off = bridge.off ?? bridge.removeListener;
      off?.call(bridge, channel, wrapped);
    } catch {
      // The shell may already be gone.
    }
  };
}
