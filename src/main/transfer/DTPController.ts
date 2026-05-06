// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Transfer Protocol -- IPC Controller
 * Bridges DTPServer, DTPClient, and DeviceDiscovery to the renderer via IPC.
 * All transfer operations go through this controller.
 */

import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import { DTPServer } from './DTPServer';
import { DTPClient, SendProgress, SendResult } from './DTPClient';
import { DeviceDiscovery, DiscoveredDevice } from './DeviceDiscovery';
import { IPCCrypto } from '../security/IPCCrypto';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let server: DTPServer | null = null;
let client: DTPClient | null = null;
let discovery: DeviceDiscovery | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

function sendToRenderer(channel: string, ...args: any[]): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send(channel, ...args);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initDTPController(): void {
  if (initialized) return;
  initialized = true;

  server = new DTPServer();
  client = new DTPClient();
  discovery = new DeviceDiscovery();

  // Initialize server (DB, key pair, download dir)
  server.initialize().catch(err => log.error('[DTPController] Server init failed:', err));

  // -----------------------------------------------------------------------
  // Server Events -> Renderer
  // -----------------------------------------------------------------------

  server.on('device-pending', (info: any) => {
    sendToRenderer('dtp:device-pending', info);
  });

  server.on('transfer-progress', (info: any) => {
    sendToRenderer('dtp:transfer-progress', info);
  });

  server.on('transfer-complete', (info: any) => {
    sendToRenderer('dtp:transfer-complete', info);
  });

  server.on('transfer-error', (info: any) => {
    sendToRenderer('dtp:transfer-error', info);
  });

  // -----------------------------------------------------------------------
  // Discovery Events -> Renderer
  // -----------------------------------------------------------------------

  discovery.on('device-found', (device: DiscoveredDevice) => {
    sendToRenderer('dtp:device-found', device);
  });

  discovery.on('device-lost', (device: DiscoveredDevice) => {
    sendToRenderer('dtp:device-lost', device);
  });

  discovery.on('device-updated', (device: DiscoveredDevice) => {
    sendToRenderer('dtp:device-updated', device);
  });

  // -----------------------------------------------------------------------
  // IPC Handlers - Server Control
  // -----------------------------------------------------------------------

  ipcMain.handle('dtp:startServer', async () => {
    try {
      if (server) {
        server.start();
        return { success: true };
      }
      return { success: false, error: 'Server not initialized' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dtp:stopServer', async () => {
    if (server) server.stop();
    return { success: true };
  });

  // -----------------------------------------------------------------------
  // IPC Handlers - Discovery
  // -----------------------------------------------------------------------

  ipcMain.handle('dtp:startDiscovery', async () => {
    if (discovery) {
      discovery.start();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('dtp:stopDiscovery', async () => {
    if (discovery) discovery.stop();
    return { success: true };
  });

  ipcMain.handle('dtp:getDevices', async () => {
    return discovery ? discovery.getPeers() : [];
  });

  ipcMain.handle('dtp:refreshDevices', async () => {
    if (discovery) discovery.refresh();
    return { success: true };
  });

  // -----------------------------------------------------------------------
  // IPC Handlers - Sending
  // -----------------------------------------------------------------------

  ipcMain.handle('dtp:sendFiles', async (_, args: {
    files: string[];
    targetAddress: string;
    targetPort?: number;
    sessionToken: any; // SealedEnvelope from preload
  }) => {
    if (!client) return { success: false, error: 'Client not initialized' };

    try {
      const sessionToken = IPCCrypto.open(args.sessionToken);
      const result = await client.send({
        files: args.files,
        targetAddress: args.targetAddress,
        targetPort: args.targetPort,
        sessionToken,
        onProgress: (progress: SendProgress) => {
          sendToRenderer('dtp:send-progress', progress);
        },
        onComplete: (result: SendResult) => {
          sendToRenderer('dtp:send-complete', result);
        },
        onError: (error: Error) => {
          sendToRenderer('dtp:send-error', { message: error.message });
        },
      });
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dtp:cancelSend', async (_, transferId: string) => {
    if (client) client.cancelSend(transferId);
    return { success: true };
  });

  ipcMain.handle('dtp:pauseSend', async (_, transferId: string) => {
    if (client) client.pauseSend(transferId);
    return { success: true };
  });

  ipcMain.handle('dtp:resumeSend', async (_, transferId: string) => {
    if (client) client.resumeSend(transferId);
    return { success: true };
  });

  // -----------------------------------------------------------------------
  // IPC Handlers - Receiving
  // -----------------------------------------------------------------------

  ipcMain.handle('dtp:approveDevice', async (_, deviceId: string) => {
    if (server) {
      server.approveDevice(deviceId);
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('dtp:denyDevice', async (_, deviceId: string) => {
    if (server) {
      server.denyDevice(deviceId);
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('dtp:pauseReceive', async (_, transferId: string) => {
    if (server) {
      server.pauseTransfer(transferId);
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('dtp:cancelReceive', async (_, transferId: string) => {
    if (server) {
      server.cancelTransfer(transferId);
      return { success: true };
    }
    return { success: false };
  });

  // -----------------------------------------------------------------------
  // IPC Handlers - History + Devices
  // -----------------------------------------------------------------------

  ipcMain.handle('dtp:getHistory', async (_, limit?: number) => {
    if (server) return server.getTransferHistory(limit);
    return [];
  });

  ipcMain.handle('dtp:getTrustedDevices', async () => {
    if (server) return server.getTrustedDevices();
    return [];
  });

  ipcMain.handle('dtp:removeTrustedDevice', async (_, deviceId: string) => {
    if (server) {
      server.removeTrustedDevice(deviceId);
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('dtp:measureBandwidth', async (_, args: { address: string; port?: number }) => {
    if (!client) return { mbps: 0 };
    const mbps = await client.measureBandwidth(args.address, args.port);
    return { mbps };
  });

  // -----------------------------------------------------------------------
  // IPC Handlers - Retry + Clear History
  // -----------------------------------------------------------------------

  ipcMain.handle('dtp:retryTransfer', async (_, transferId: string) => {
    if (!server) return { success: false, error: 'Server not initialized' };
    try {
      server.retryTransfer?.(transferId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dtp:clearHistory', async () => {
    if (!server) return { success: false, error: 'Server not initialized' };
    try {
      server.clearTransferHistory?.();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  log.info('[DTPController] Initialized');
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startDTP(): void {
  if (server) server.start();
  // Discovery starts on-demand when user opens Transfers page (saves network/CPU)
  log.info('[DTPController] DTP server started (discovery deferred until needed)');
}

/** Call when user opens Transfers page */
export function startDiscovery(): void {
  if (discovery) discovery.start();
  log.info('[DTPController] Discovery started on demand');
}

export function stopDTP(): void {
  if (server) server.stop();
  if (discovery) discovery.stop();
  log.info('[DTPController] DTP server and discovery stopped');
}
