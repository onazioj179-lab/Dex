// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX - IPC Rate Limiter
 * ===========================================================================
 * 
 * Prevents abuse of expensive IPC operations from the renderer process.
 * Rate limits are per-channel with configurable windows and limits.
 */

import * as log from 'electron-log';

interface RateLimitConfig {
  /** Maximum number of calls allowed within the window */
  maxCalls: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/** Default rate limits by channel pattern */
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  // File system operations - moderate limits
  'media:getMediaFiles': { maxCalls: 5, windowMs: 60000 },
  'download:start': { maxCalls: 10, windowMs: 60000 },
  'download:list': { maxCalls: 30, windowMs: 60000 },
  'creativeApps:saveFile': { maxCalls: 30, windowMs: 60000 },
  'creativeApps:readFile': { maxCalls: 60, windowMs: 60000 },
  'capability:fileSystem:list': { maxCalls: 60, windowMs: 60000 },
  'capability:fileSystem:copy': { maxCalls: 20, windowMs: 60000 },
  'capability:fileSystem:move': { maxCalls: 20, windowMs: 60000 },
  
  // CRUD operations - generous but not unlimited
  'mode:save': { maxCalls: 30, windowMs: 60000 },
  'rule:save': { maxCalls: 30, windowMs: 60000 },
  'action:save': { maxCalls: 30, windowMs: 60000 },
  'action:execute': { maxCalls: 60, windowMs: 60000 },
  
  // Storage - prevent disk abuse
  'capability:storage:set': { maxCalls: 100, windowMs: 60000 },
  
  // Expensive scans
  'search:rebuild': { maxCalls: 2, windowMs: 300000 },
  'fs:readdir': { maxCalls: 60, windowMs: 60000 },
};

class IPCRateLimiter {
  private callTimestamps: Map<string, number[]> = new Map();
  private customLimits: Map<string, RateLimitConfig> = new Map();

  /**
   * Check if an IPC call should be permitted.
   * @param channel   IPC channel name
   * @param senderId  Optional webContents ID — when provided the limit is
   *                  scoped per-window so one renderer cannot starve others.
   * Returns true if allowed, false if rate limited.
   */
  check(channel: string, senderId?: number): boolean {
    const config = this.customLimits.get(channel) || DEFAULT_LIMITS[channel];
    if (!config) return true; // No limit configured for this channel

    // Per-sender key when available; fall back to global channel key
    const key = senderId !== undefined ? `${channel}:${senderId}` : channel;
    const now = Date.now();
    let timestamps = this.callTimestamps.get(key) || [];

    // Remove expired timestamps
    timestamps = timestamps.filter(t => now - t < config.windowMs);

    if (timestamps.length >= config.maxCalls) {
      log.warn(`[RateLimiter] Rate limit exceeded for IPC channel: ${channel}${senderId !== undefined ? ` (sender ${senderId})` : ''} (${timestamps.length}/${config.maxCalls} in ${config.windowMs}ms)`);
      return false;
    }

    timestamps.push(now);
    this.callTimestamps.set(key, timestamps);
    return true;
  }

  /**
   * Apply rate limiting and throw if exceeded.
   */
  enforce(channel: string, senderId?: number): void {
    if (!this.check(channel, senderId)) {
      throw new Error(`Rate limit exceeded for ${channel}. Please try again later.`);
    }
  }

  /**
   * Set a custom rate limit for a channel.
   */
  setLimit(channel: string, config: RateLimitConfig): void {
    this.customLimits.set(channel, config);
  }

  /**
   * Clean up stale entries (call periodically).
   */
  cleanup(): void {
    const now = Date.now();
    for (const [channel, timestamps] of this.callTimestamps.entries()) {
      const config = this.customLimits.get(channel) || DEFAULT_LIMITS[channel];
      const windowMs = config?.windowMs || 60000;
      const recent = timestamps.filter(t => now - t < windowMs);
      if (recent.length === 0) {
        this.callTimestamps.delete(channel);
      } else {
        this.callTimestamps.set(channel, recent);
      }
    }
  }
}

export const ipcRateLimiter = new IPCRateLimiter();

// Auto-cleanup every 5 minutes (stored for shutdown cleanup)
const cleanupInterval = setInterval(() => ipcRateLimiter.cleanup(), 5 * 60 * 1000);
process.on('exit', () => clearInterval(cleanupInterval));
