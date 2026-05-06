// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Audio Manager
// ==========================================================================
// Feature 40: Audio Device Change Monitoring
// Feature 41: Shared Audio Context Management
// ==========================================================================

import * as log from 'electron-log';
import { ipcMain, BrowserWindow } from 'electron';

// ---------------------------------------------------------------------------
// Feature 40: Audio Device Change Monitoring
// ---------------------------------------------------------------------------

export interface AudioDevice {
  id: string;
  name: string;
  type: 'input' | 'output';
  isDefault: boolean;
  lastSeenAt: number;
}

class AudioDeviceMonitor {
  private devices = new Map<string, AudioDevice>();
  private pollInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;
  private listeners: Array<(devices: AudioDevice[], changeType: 'added' | 'removed' | 'default-changed') => void> = [];

  initialize(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;

    // Listen for device change reports from renderer
    ipcMain.on('audio:devices-report', (_e, devices: AudioDevice[]) => {
      this.processDeviceReport(devices);
    });

    // Request device enumeration periodically (60s is sufficient for hotplug detection)
    this.pollInterval = setInterval(() => {
      this.requestDeviceEnumeration();
    }, 60_000);

    // Initial request
    setTimeout(() => this.requestDeviceEnumeration(), 3000);

    log.info('[AudioDevice] Feature 40: Audio device monitor initialized');
  }

  private requestDeviceEnumeration(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('audio:enumerate-devices');
    }
  }

  private processDeviceReport(reportedDevices: AudioDevice[]): void {
    const oldIds = new Set(this.devices.keys());
    const newIds = new Set(reportedDevices.map(d => d.id));

    const added: AudioDevice[] = [];
    const removed: AudioDevice[] = [];
    let defaultChanged = false;

    // Check for new devices
    for (const device of reportedDevices) {
      device.lastSeenAt = Date.now();
      if (!oldIds.has(device.id)) {
        added.push(device);
      }

      const existing = this.devices.get(device.id);
      if (existing && existing.isDefault !== device.isDefault) {
        defaultChanged = true;
      }

      this.devices.set(device.id, device);
    }

    // Check for removed devices
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        const device = this.devices.get(id)!;
        removed.push(device);
        this.devices.delete(id);
      }
    }

    if (added.length > 0) {
      log.info(`[AudioDevice] Added: ${added.map(d => d.name).join(', ')}`);
      this.notifyListeners('added');
    }

    if (removed.length > 0) {
      log.info(`[AudioDevice] Removed: ${removed.map(d => d.name).join(', ')}`);
      this.notifyListeners('removed');
    }

    if (defaultChanged) {
      log.info('[AudioDevice] Default device changed');
      this.notifyListeners('default-changed');
    }
  }

  private notifyListeners(changeType: 'added' | 'removed' | 'default-changed'): void {
    const deviceList = this.getDevices();
    for (const listener of this.listeners) {
      try { listener(deviceList, changeType); } catch { /* ok */ }
    }

    // Notify renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('audio:devices-changed', {
        devices: deviceList,
        changeType,
      });
    }
  }

  onDeviceChange(listener: (devices: AudioDevice[], changeType: 'added' | 'removed' | 'default-changed') => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  getDevices(): AudioDevice[] {
    return Array.from(this.devices.values());
  }

  getOutputDevices(): AudioDevice[] {
    return Array.from(this.devices.values()).filter(d => d.type === 'output');
  }

  getInputDevices(): AudioDevice[] {
    return Array.from(this.devices.values()).filter(d => d.type === 'input');
  }

  getDefaultOutput(): AudioDevice | null {
    return Array.from(this.devices.values()).find(d => d.type === 'output' && d.isDefault) || null;
  }

  getDefaultInput(): AudioDevice | null {
    return Array.from(this.devices.values()).find(d => d.type === 'input' && d.isDefault) || null;
  }

  shutdown(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.listeners = [];
  }
}

// ---------------------------------------------------------------------------
// Feature 41: Shared Audio Context
// ---------------------------------------------------------------------------

interface AudioContextState {
  id: string;
  sampleRate: number;
  state: 'running' | 'suspended' | 'closed';
  createdAt: number;
  consumerCount: number;
  consumers: Set<string>;
}

class SharedAudioContextManager {
  private contexts = new Map<string, AudioContextState>();
  private defaultSampleRate = 44100;
  private maxContexts = 4;
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;

    ipcMain.handle('audio-context:acquire', (_e, consumerId: string, sampleRate?: number) => {
      return this.acquireContext(consumerId, sampleRate);
    });

    ipcMain.handle('audio-context:release', (_e, consumerId: string, contextId: string) => {
      this.releaseContext(consumerId, contextId);
    });

    ipcMain.handle('audio-context:suspend', (_e, contextId: string) => {
      this.suspendContext(contextId);
    });

    ipcMain.handle('audio-context:resume', (_e, contextId: string) => {
      this.resumeContext(contextId);
    });

    log.info('[SharedAudioContext] Feature 41: Shared audio context manager initialized');
  }

  acquireContext(consumerId: string, sampleRate?: number): { contextId: string; sampleRate: number } {
    const targetRate = sampleRate || this.defaultSampleRate;

    // Try to find an existing context with matching sample rate
    for (const [id, ctx] of this.contexts) {
      if (ctx.sampleRate === targetRate && ctx.state !== 'closed') {
        ctx.consumers.add(consumerId);
        ctx.consumerCount = ctx.consumers.size;
        return { contextId: id, sampleRate: ctx.sampleRate };
      }
    }

    // Create new context if under limit
    if (this.contexts.size >= this.maxContexts) {
      // Try to close an unused context
      for (const [id, ctx] of this.contexts) {
        if (ctx.consumers.size === 0) {
          this.closeContext(id);
          break;
        }
      }
    }

    const contextId = `audio-ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const context: AudioContextState = {
      id: contextId,
      sampleRate: targetRate,
      state: 'running',
      createdAt: Date.now(),
      consumerCount: 1,
      consumers: new Set([consumerId]),
    };

    this.contexts.set(contextId, context);

    // Tell renderer to create the actual AudioContext
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('audio-context:create', {
        contextId,
        sampleRate: targetRate,
      });
    }

    log.info(`[SharedAudioContext] Created context '${contextId}' at ${targetRate}Hz for '${consumerId}'`);
    return { contextId, sampleRate: targetRate };
  }

  releaseContext(consumerId: string, contextId: string): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return;

    ctx.consumers.delete(consumerId);
    ctx.consumerCount = ctx.consumers.size;

    if (ctx.consumers.size === 0) {
      // Suspend instead of closing immediately -- may be reused
      this.suspendContext(contextId);
      log.info(`[SharedAudioContext] Suspended unused context '${contextId}'`);
    }
  }

  private suspendContext(contextId: string): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx || ctx.state === 'closed') return;

    ctx.state = 'suspended';
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('audio-context:suspend', { contextId });
    }
  }

  private resumeContext(contextId: string): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx || ctx.state === 'closed') return;

    ctx.state = 'running';
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('audio-context:resume', { contextId });
    }
  }

  private closeContext(contextId: string): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return;

    ctx.state = 'closed';
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('audio-context:close', { contextId });
    }

    this.contexts.delete(contextId);
    log.info(`[SharedAudioContext] Closed context '${contextId}'`);
  }

  getStats(): { contexts: number; totalConsumers: number; states: Record<string, string> } {
    const states: Record<string, string> = {};
    let totalConsumers = 0;

    for (const [id, ctx] of this.contexts) {
      states[id] = ctx.state;
      totalConsumers += ctx.consumerCount;
    }

    return { contexts: this.contexts.size, totalConsumers, states };
  }

  shutdown(): void {
    for (const [id] of this.contexts) {
      this.closeContext(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const audioDeviceMonitor = new AudioDeviceMonitor();
export const sharedAudioContext = new SharedAudioContextManager();

export function initializeAudioManager(mainWindow: BrowserWindow | null): void {
  audioDeviceMonitor.initialize(mainWindow);
  sharedAudioContext.initialize(mainWindow);
  log.info('[AudioManager] Features 40-41: Audio manager initialized');
}

export function shutdownAudioManager(): void {
  audioDeviceMonitor.shutdown();
  sharedAudioContext.shutdown();
}
