// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Live Collaboration Indicator Manager (Feature 15)
// Shows when another DEX instance has the same project open via mDNS.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as os from 'os';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface CollaborationPeer {
  hostname: string;
  app: string;
  projectId: string;
  openedAt: number;
}

class LiveCollaborationManager {
  private mainWindow: BrowserWindow | null = null;
  private currentProject: { app: string; projectId: string } | null = null;
  private peers: Map<string, CollaborationPeer> = new Map();
  private enabled: boolean = true;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private hostname: string;

  constructor() {
    this.hostname = os.hostname();
  }

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.loadSettings();
    this.registerIPC();
    this.startPeerDiscovery();
    log.info('[LiveCollaboration] Live collaboration indicator initialized');
  }

  private loadSettings(): void {
    const val = databaseManager.getSetting('live_collab_enabled', 'true');
    this.enabled = val !== 'false';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    databaseManager.setSetting('live_collab_enabled', enabled ? 'true' : 'false');
    if (!enabled) {
      this.peers.clear();
      this.notifyRenderer();
    }
  }

  setCurrentProject(app: string, projectId: string): void {
    this.currentProject = { app, projectId };
    this.broadcastPresence();
  }

  clearCurrentProject(): void {
    this.currentProject = null;
    this.broadcastPresence();
  }

  private startPeerDiscovery(): void {
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    this.broadcastInterval = setInterval(() => {
      this.cleanupStalePeers();
    }, 30000);
  }

  private broadcastPresence(): void {
    if (!this.enabled || !this.currentProject) return;
    // The actual mDNS broadcast is handled by the existing service discovery system.
    // This manager tracks the data that should be included in the mDNS TXT record.
  }

  registerPeer(hostname: string, app: string, projectId: string): void {
    if (!this.enabled) return;
    if (hostname === this.hostname) return;

    const key = `${hostname}:${app}:${projectId}`;
    this.peers.set(key, {
      hostname, app, projectId, openedAt: Date.now(),
    });
    this.notifyRenderer();
  }

  removePeer(hostname: string): void {
    const keysToRemove: string[] = [];
    for (const [key, peer] of this.peers) {
      if (peer.hostname === hostname) keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      this.peers.delete(key);
    }
    if (keysToRemove.length > 0) this.notifyRenderer();
  }

  private cleanupStalePeers(): void {
    const staleThreshold = Date.now() - 120000;
    const keysToRemove: string[] = [];
    for (const [key, peer] of this.peers) {
      if (peer.openedAt < staleThreshold) keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      this.peers.delete(key);
    }
    if (keysToRemove.length > 0) this.notifyRenderer();
  }

  getPeersForProject(app: string, projectId: string): CollaborationPeer[] {
    if (!this.enabled) return [];
    const result: CollaborationPeer[] = [];
    for (const peer of this.peers.values()) {
      if (peer.app === app && peer.projectId === projectId) {
        result.push(peer);
      }
    }
    return result;
  }

  private notifyRenderer(): void {
    if (this.mainWindow) {
      const peersArray = Array.from(this.peers.values());
      this.mainWindow.webContents.send('live-collab:peersChanged', peersArray);
    }
  }

  private registerIPC(): void {
    ipcMain.handle('live-collab:setProject', async (_event, app: string, projectId: string) => {
      this.setCurrentProject(app, projectId);
    });

    ipcMain.handle('live-collab:clearProject', async () => {
      this.clearCurrentProject();
    });

    ipcMain.handle('live-collab:getPeers', async (_event, app: string, projectId: string) => {
      return this.getPeersForProject(app, projectId);
    });

    ipcMain.handle('live-collab:setEnabled', async (_event, enabled: boolean) => {
      this.setEnabled(enabled);
    });

    ipcMain.handle('live-collab:isEnabled', async () => {
      return this.enabled;
    });
  }

  shutdown(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }
}

export const liveCollaborationManager = new LiveCollaborationManager();
