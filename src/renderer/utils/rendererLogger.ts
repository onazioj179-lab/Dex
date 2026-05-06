// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Renderer Logger
 * Centralized logging for the renderer process.
 * Routes logs through IPC to the main process logger in production.
 * Uses console only in development mode.
 */

const isDev = import.meta.env?.DEV === true
  || (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.hostname === 'localhost'));

function getElectronBridge(): any {
  return (window as any).electron || (window as any).dexAPI;
}

function sendToMain(level: string, message: string, data?: unknown): void {
  try {
    const bridge = getElectronBridge();
    if (bridge?.invoke) {
      bridge.invoke('log:renderer', { level, message, data }).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
  } catch {
    // Silently fail if IPC unavailable
  }
}

export const rendererLogger = {
  info(message: string, data?: unknown): void {
    if (isDev) {
      console.log(message, data !== undefined ? data : '');
    }
    sendToMain('info', message, data);
  },

  warn(message: string, data?: unknown): void {
    if (isDev) {
      console.warn(message, data !== undefined ? data : '');
    }
    sendToMain('warn', message, data);
  },

  error(message: string, data?: unknown): void {
    if (isDev) {
      console.error(message, data !== undefined ? data : '');
    }
    sendToMain('error', message, data);
  },

  debug(message: string, data?: unknown): void {
    if (isDev) {
      console.debug(message, data !== undefined ? data : '');
    }
  },
};
