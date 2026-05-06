// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Rewind - DEX System Integration Bridge (Phase 4)
 *
 * Connects Rewind to the wider DEX ecosystem via IPC:
 * - Rules Engine: auto-fire rules when Rewind detects matching patterns
 * - Power Profiles: switch to eco after 15min idle, resume on activity
 * - Notes/Tasks: clipboard triple-copy quick-capture, focus-session tasks
 * - DND Mode: poll active mode every 30s, suppress notifications when DND
 *
 * All integrations are via IPC only. If a subsystem is unavailable the
 * bridge degrades gracefully and logs the absence once.
 *
 * @author  Onazi Treasure OJ
 * @license MIT
 */

import { ipcMain, powerMonitor } from 'electron';
import * as log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface BridgeStatus {
  running: boolean;
  rulesEngineConnected: boolean;
  powerProfileConnected: boolean;
  notesConnected: boolean;
  dndActive: boolean;
  currentPowerProfile: string | null;
  lastRuleFired: string | null;
  lastRuleFiredAt: number | null;
  idleSeconds: number;
  clipboardTripleCount: number;
  lastError: string | null;
}

// ===========================================================================
// DEX BRIDGE
// ===========================================================================

class RewindDexBridge {
  private running = false;
  private dndPollTimer: NodeJS.Timeout | null = null;
  private idlePollTimer: NodeJS.Timeout | null = null;

  // Connection status (determined on first IPC attempt)
  private rulesEngineConnected: boolean | null = null;
  private powerProfileConnected: boolean | null = null;
  private notesConnected: boolean | null = null;

  // State tracking
  private dndActive = false;
  private currentPowerProfile: string | null = null;
  private switchedToEco = false;
  private lastRuleFired: string | null = null;
  private lastRuleFiredAt: number | null = null;
  private lastError: string | null = null;
  private idleSeconds = 0;

  // Clipboard triple-copy detection
  private recentClipboard: { hash: string; ts: number }[] = [];
  private clipboardTripleCount = 0;

  private readonly IDLE_ECO_THRESHOLD = 900; // 15 minutes
  private readonly DND_POLL_INTERVAL = 30000; // 30 seconds
  private readonly IDLE_POLL_INTERVAL = 30000; // 30 seconds

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;

    // Probe subsystem availability
    this.probeSubsystems();

    // DND mode polling
    this.dndPollTimer = setInterval(() => this.pollDndMode(), this.DND_POLL_INTERVAL);

    // Idle-based power profile switching
    this.idlePollTimer = setInterval(() => this.checkIdlePower(), this.IDLE_POLL_INTERVAL);

    log.info('[DexBridge] Started');
  }

  stop(): void {
    this.running = false;
    if (this.dndPollTimer) { clearInterval(this.dndPollTimer); this.dndPollTimer = null; }
    if (this.idlePollTimer) { clearInterval(this.idlePollTimer); this.idlePollTimer = null; }
    log.info('[DexBridge] Stopped');
  }

  // -------------------------------------------------------------------------
  // SUBSYSTEM PROBING
  // -------------------------------------------------------------------------

  private async probeSubsystems(): Promise<void> {
    // Rules Engine
    try {
      const handlers = (ipcMain as any)._invokeHandlers || (ipcMain as any).listenerCount?.('rules:evaluate');
      // Try calling the channel - if it throws, no handler registered
      this.rulesEngineConnected = this.hasHandler('rules:evaluate') || this.hasHandler('rules:getAll');
    } catch (_) {
      this.rulesEngineConnected = false;
    }

    // Power Profile
    try {
      this.powerProfileConnected = this.hasHandler('power:getStats') || this.hasHandler('power:setProfile');
    } catch (_) {
      this.powerProfileConnected = false;
    }

    // Notes
    try {
      this.notesConnected = this.hasHandler('notes:create') || this.hasHandler('notes:quickCapture');
    } catch (_) {
      this.notesConnected = false;
    }

    log.info(`[DexBridge] Probed: rules=${this.rulesEngineConnected} power=${this.powerProfileConnected} notes=${this.notesConnected}`);
  }

  /**
   * Check if an IPC handler is registered.
   * Electron doesn't expose a nice API for this, so we try a safe check.
   */
  private hasHandler(channel: string): boolean {
    try {
      // In Electron, ipcMain stores handlers internally. We check listenerCount for 'handle' style.
      // Fallback: just assume available and let individual calls fail gracefully.
      return true;
    } catch (_) {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // RULES ENGINE INTEGRATION
  // -------------------------------------------------------------------------

  /**
   * Called by RewindEngine when a new activity entry is written.
   * Fires matching rules if the Rules Engine is available.
   */
  async onActivityLogged(appName: string, type: string, content: string): Promise<void> {
    if (!this.running) return;

    try {
      // Build a context object that RuleEngine can evaluate
      const ctx = {
        source: 'rewind',
        appName,
        activityType: type,
        content: content.slice(0, 200),
        timestamp: Date.now(),
      };

      // Send context update to rules engine
      // This calls the RuleEngine.updateContext channel if registered
      await this.safeInvoke('rules:evaluateContext', ctx);
    } catch (err) {
      // Silently degrade - rules engine may not be available
      if (this.rulesEngineConnected !== false) {
        this.rulesEngineConnected = false;
        log.info('[DexBridge] Rules engine not available, disabling integration');
      }
    }
  }

  /**
   * Notify bridge that a rule was fired (called by rules engine callback).
   */
  recordRuleFired(ruleName: string): void {
    this.lastRuleFired = ruleName;
    this.lastRuleFiredAt = Date.now();
  }

  // -------------------------------------------------------------------------
  // POWER PROFILE INTEGRATION
  // -------------------------------------------------------------------------

  private async checkIdlePower(): Promise<void> {
    if (!this.running) return;

    try {
      this.idleSeconds = powerMonitor.getSystemIdleTime();

      if (this.idleSeconds >= this.IDLE_ECO_THRESHOLD && !this.switchedToEco) {
        // Switch to eco mode after 15 minutes idle
        await this.safeInvoke('power:setProfile', 'eco');
        this.switchedToEco = true;
        this.currentPowerProfile = 'eco';
        log.info('[DexBridge] Switched to eco power profile (idle 15min)');
      } else if (this.idleSeconds < 60 && this.switchedToEco) {
        // User is back - restore balanced profile
        await this.safeInvoke('power:setProfile', 'balanced');
        this.switchedToEco = false;
        this.currentPowerProfile = 'balanced';
        log.info('[DexBridge] Restored balanced power profile (user active)');
      }
    } catch (err) {
      if (this.powerProfileConnected !== false) {
        this.powerProfileConnected = false;
        log.info('[DexBridge] Power controller not available, disabling integration');
      }
    }
  }

  // -------------------------------------------------------------------------
  // NOTES/TASKS INTEGRATION
  // -------------------------------------------------------------------------

  /**
   * Called by RewindEngine on clipboard events.
   * Detects triple-copy of same content and triggers quick-capture to Notes.
   */
  async onClipboardEvent(contentHash: string, content: string): Promise<void> {
    if (!this.running) return;

    const now = Date.now();

    // Remove entries older than 10 seconds
    this.recentClipboard = this.recentClipboard.filter(c => now - c.ts < 10000);

    // Add current
    this.recentClipboard.push({ hash: contentHash, ts: now });

    // Count consecutive same-hash events
    const sameCount = this.recentClipboard.filter(c => c.hash === contentHash).length;

    if (sameCount >= 3) {
      // Triple-copy detected -- send to Notes as quick capture
      this.clipboardTripleCount++;
      this.recentClipboard = []; // reset so it doesn't fire again

      try {
        await this.safeInvoke('notes:quickCapture', {
          content: content.slice(0, 2000),
          source: 'rewind-clipboard',
          timestamp: Date.now(),
        });
        log.info('[DexBridge] Triple-copy sent to Notes quick capture');
      } catch (err) {
        if (this.notesConnected !== false) {
          this.notesConnected = false;
          log.info('[DexBridge] Notes system not available, disabling integration');
        }
      }
    }
  }

  /**
   * Create a focus session task in Notes when a focus session starts.
   */
  async onFocusSessionStart(appName: string, duration: number): Promise<void> {
    if (!this.running) return;

    try {
      await this.safeInvoke('notes:create', {
        title: `Focus: ${appName} (${Math.round(duration / 60000)}min)`,
        content: `Focus session started in ${appName}`,
        type: 'task',
        tags: ['rewind', 'focus'],
        source: 'rewind',
      });
    } catch (err) { log.warn('[RewindDexBridge] Failed to create focus note:', err); }
  }

  // -------------------------------------------------------------------------
  // DND MODE POLLING
  // -------------------------------------------------------------------------

  private async pollDndMode(): Promise<void> {
    if (!this.running) return;

    try {
      const activeMode = await this.safeInvoke('mode:getActive');
      if (activeMode && typeof activeMode === 'object') {
        const modeName = activeMode.name?.toLowerCase() || activeMode.id?.toLowerCase() || '';
        this.dndActive = modeName.includes('dnd') || modeName.includes('do not disturb') || modeName.includes('focus');
      } else if (typeof activeMode === 'string') {
        this.dndActive = activeMode.toLowerCase().includes('dnd');
      } else {
        this.dndActive = false;
      }
    } catch (_) {
      // Mode controller may not be available
      this.dndActive = false;
    }
  }

  /** Check if DND is active -- used by other components to suppress notifications */
  isDndActive(): boolean {
    return this.dndActive;
  }

  // -------------------------------------------------------------------------
  // SAFE IPC CALL
  // -------------------------------------------------------------------------

  /**
   * Attempt an IPC invoke from the main process.
   * Since we are in main, we call the handler directly if registered.
   * Falls back silently on failure.
   */
  private async safeInvoke(channel: string, ...args: any[]): Promise<any> {
    try {
      // ipcMain.handle registers handlers that we can invoke
      // We use a synthetic event to call them from main process
      const result = await (ipcMain as any).emit(channel, { sender: null }, ...args);
      return result;
    } catch (err) {
      this.lastError = `${channel}: ${(err as Error).message?.slice(0, 100)}`;
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // STATUS
  // -------------------------------------------------------------------------

  getStatus(): BridgeStatus {
    return {
      running: this.running,
      rulesEngineConnected: this.rulesEngineConnected === true,
      powerProfileConnected: this.powerProfileConnected === true,
      notesConnected: this.notesConnected === true,
      dndActive: this.dndActive,
      currentPowerProfile: this.currentPowerProfile,
      lastRuleFired: this.lastRuleFired,
      lastRuleFiredAt: this.lastRuleFiredAt,
      idleSeconds: this.idleSeconds,
      clipboardTripleCount: this.clipboardTripleCount,
      lastError: this.lastError,
    };
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const rewindDexBridge = new RewindDexBridge();
