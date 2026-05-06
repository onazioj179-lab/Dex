// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Defense Controller
// IPC bridge for DefenseOrchestrator. Wires the orchestrator to live response
// surfaces (Rewind snapshot, plugin quarantine, IPC rotation, vault lock,
// network lockdown, file restore) and exposes IPC handlers for status / push.
// ===========================================================================

import { ipcMain, app, BrowserWindow } from 'electron';
import log from 'electron-log';
import {
  configureDefenseOrchestrator,
  getDefenseOrchestrator,
  type DefenseSignal,
  type DefenseResponses,
} from '../security/DefenseOrchestrator';
import { IPCCrypto } from '../security/IPCCrypto';

class DefenseControllerImpl {
  private static instance: DefenseControllerImpl;
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  static getInstance(): DefenseControllerImpl {
    if (!DefenseControllerImpl.instance) {
      DefenseControllerImpl.instance = new DefenseControllerImpl();
    }
    return DefenseControllerImpl.instance;
  }

  initialize(mainWindow: BrowserWindow): void {
    if (this.initialized) return;
    this.mainWindow = mainWindow;
    const responses: DefenseResponses = {
      snapshot: () => this.notifyRenderer('defense:snapshot', {}),
      quarantinePlugin: (id) => this.notifyRenderer('defense:quarantine', { pluginId: id }),
      rotateIPC: async () => {
        try {
          const cryptoAny = IPCCrypto as unknown as { rotate?: () => void };
          if (typeof cryptoAny.rotate === 'function') cryptoAny.rotate();
        } catch (err) {
          log.warn('[DefenseController] IPC rotate failed:', err);
        }
      },
      lockIdentityVault: () => this.notifyRenderer('defense:vault-lock', {}),
      networkLockdown: (enable) => this.notifyRenderer('defense:network-lockdown', { enable }),
      restoreFiles: (paths) => this.notifyRenderer('defense:restore-files', { paths }),
      emitNexusEmergency: (reason) => this.notifyRenderer('nexus:emergency', { reason }),
    };
    configureDefenseOrchestrator(responses);
    this.setupIPC();
    this.initialized = true;
    if (!app.isPackaged) log.info('[DefenseController] Initialized');
  }

  private notifyRenderer(channel: string, payload: Record<string, unknown>): void {
    try {
      this.mainWindow?.webContents.send(channel, payload);
    } catch { /* renderer may be gone */ }
  }

  private setupIPC(): void {
    ipcMain.handle('defense:status', () => {
      const o = getDefenseOrchestrator();
      return o ? { ok: true, status: o.status() } : { ok: false, error: 'not-configured' };
    });

    ipcMain.handle('defense:report', async (_e, signal: unknown) => {
      const o = getDefenseOrchestrator();
      if (!o) return { ok: false, error: 'not-configured' };
      if (!signal || typeof signal !== 'object') return { ok: false, error: 'invalid-signal' };
      const tier = await o.ingest(signal as DefenseSignal);
      return { ok: true, tier };
    });

    ipcMain.handle('defense:lockdown', async (_e, enable: unknown) => {
      const o = getDefenseOrchestrator();
      if (!o) return { ok: false };
      await o.forceTier(enable ? 'critical' : 'green');
      return { ok: true, status: o.status() };
    });

    // Periodically nudge the orchestrator to consider auto-recovery.
    const recoverTimer = setInterval(() => {
      const o = getDefenseOrchestrator();
      if (o) o.maybeRecover().catch(() => undefined);
    }, 30_000);
    if (typeof recoverTimer.unref === 'function') recoverTimer.unref();
  }
}

export const defenseController = DefenseControllerImpl.getInstance();
