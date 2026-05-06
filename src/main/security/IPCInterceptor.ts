// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Global IPC Interceptor
// Provides security middleware for all IPC channels
// ===========================================================================

import { ipcMain, IpcMainInvokeEvent, IpcMainEvent, webContents } from 'electron';
import log from 'electron-log';
import { InputSanitizer } from './IPCValidator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterceptorConfig {
  enabled: boolean;
  globalRateLimit: number;        // Max calls per second per sender (all channels combined)
  perChannelRateLimit: number;    // Default per-channel rate limit
  maxPayloadBytes: number;        // Default max payload size
  logViolations: boolean;         // Log rate limit violations
  blockMalicious: boolean;        // Block requests with malicious patterns
}

interface SenderStats {
  totalCalls: number;
  callsThisSecond: number;
  windowStart: number;
  violations: number;
  blocked: boolean;
  blockedUntil: number;
}

interface SecurityEvent {
  timestamp: number;
  senderId: number;
  channel: string;
  type: 'rate_limit' | 'payload_size' | 'malicious_pattern' | 'blocked_sender';
  details: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const config: InterceptorConfig = {
  enabled: true,
  globalRateLimit: 500,           // 500 calls/second per sender across all channels
  perChannelRateLimit: 100,       // 100 calls/second per channel per sender
  maxPayloadBytes: 1_048_576,     // 1MB default
  logViolations: true,
  blockMalicious: true,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const senderStats = new Map<number, SenderStats>();
const channelStats = new Map<string, Map<number, { count: number; windowStart: number }>>();
const securityEvents: SecurityEvent[] = [];
const MAX_SECURITY_EVENTS = 500;

// Channels that bypass rate limiting (internal channels)
const BYPASS_CHANNELS = new Set([
  'get-app-path',
  'get-version',
  'get-platform',
]);

// Suspicious patterns to block
const MALICIOUS_PATTERNS = [
  /\.\.[\/\\]/,                    // Path traversal
  /<script/i,                       // Script injection
  /javascript:/i,                   // JavaScript protocol
  /\x00/,                          // Null bytes
  /eval\s*\(/i,                    // eval() calls
  /Function\s*\(/i,                // Function constructor
];

// ---------------------------------------------------------------------------
// Core Interceptor Logic
// ---------------------------------------------------------------------------

/**
 * Validate an IPC request before it reaches the handler
 */
function validateRequest(
  channel: string,
  senderId: number | undefined,
  args: unknown[]
): { allowed: boolean; reason?: string } {
  if (!config.enabled || !senderId) {
    return { allowed: true };
  }

  // Bypass internal channels
  if (BYPASS_CHANNELS.has(channel)) {
    return { allowed: true };
  }

  // Check if sender is blocked
  const stats = getSenderStats(senderId);
  if (stats.blocked && Date.now() < stats.blockedUntil) {
    recordSecurityEvent(senderId, channel, 'blocked_sender', 'Sender temporarily blocked');
    return { allowed: false, reason: 'Temporarily blocked due to excessive violations' };
  } else if (stats.blocked) {
    // Unblock after timeout
    stats.blocked = false;
    stats.violations = 0;
  }

  // Global rate limit per sender
  const now = Date.now();
  if (now - stats.windowStart > 1000) {
    stats.callsThisSecond = 0;
    stats.windowStart = now;
  }
  stats.callsThisSecond++;
  stats.totalCalls++;

  if (stats.callsThisSecond > config.globalRateLimit) {
    stats.violations++;
    if (stats.violations >= 5) {
      stats.blocked = true;
      stats.blockedUntil = now + 60000; // Block for 1 minute
    }
    recordSecurityEvent(senderId, channel, 'rate_limit', 
      `Global rate limit exceeded: ${stats.callsThisSecond}/${config.globalRateLimit}/s`);
    return { allowed: false, reason: 'Rate limit exceeded' };
  }

  // Per-channel rate limit
  const channelAllowed = checkChannelRateLimit(channel, senderId, now);
  if (!channelAllowed) {
    recordSecurityEvent(senderId, channel, 'rate_limit', 
      `Channel rate limit exceeded`);
    return { allowed: false, reason: 'Channel rate limit exceeded' };
  }

  // Check payload size
  try {
    const serialized = JSON.stringify(args);
    const size = Buffer.byteLength(serialized, 'utf8');
    if (size > config.maxPayloadBytes) {
      recordSecurityEvent(senderId, channel, 'payload_size', 
        `Payload too large: ${size} bytes`);
      return { allowed: false, reason: 'Payload too large' };
    }
  } catch {
    // Non-serializable payload - let handler deal with it
  }

  // Check for malicious patterns
  if (config.blockMalicious) {
    const argsStr = JSON.stringify(args);
    for (const pattern of MALICIOUS_PATTERNS) {
      if (pattern.test(argsStr)) {
        stats.violations++;
        recordSecurityEvent(senderId, channel, 'malicious_pattern', 
          `Blocked malicious pattern: ${pattern.source}`);
        return { allowed: false, reason: 'Request blocked for security reasons' };
      }
    }
  }

  return { allowed: true };
}

function getSenderStats(senderId: number): SenderStats {
  let stats = senderStats.get(senderId);
  if (!stats) {
    stats = {
      totalCalls: 0,
      callsThisSecond: 0,
      windowStart: Date.now(),
      violations: 0,
      blocked: false,
      blockedUntil: 0,
    };
    senderStats.set(senderId, stats);
  }
  return stats;
}

function checkChannelRateLimit(channel: string, senderId: number, now: number): boolean {
  let channelMap = channelStats.get(channel);
  if (!channelMap) {
    channelMap = new Map();
    channelStats.set(channel, channelMap);
  }

  let stats = channelMap.get(senderId);
  if (!stats || now - stats.windowStart > 1000) {
    stats = { count: 0, windowStart: now };
    channelMap.set(senderId, stats);
  }

  stats.count++;
  return stats.count <= config.perChannelRateLimit;
}

function recordSecurityEvent(
  senderId: number,
  channel: string,
  type: SecurityEvent['type'],
  details: string
): void {
  const event: SecurityEvent = {
    timestamp: Date.now(),
    senderId,
    channel,
    type,
    details,
  };

  securityEvents.push(event);
  if (securityEvents.length > MAX_SECURITY_EVENTS) {
    securityEvents.splice(0, securityEvents.length - MAX_SECURITY_EVENTS);
  }

  if (config.logViolations) {
    log.warn(`[IPC Security] ${type}: ${channel} from sender ${senderId} - ${details}`);
  }
}

// ---------------------------------------------------------------------------
// Wrapper Functions
// ---------------------------------------------------------------------------

/**
 * Wrap an IPC handle with security validation
 */
export function secureHandle<T>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const senderId = event.sender?.id;
    const validation = validateRequest(channel, senderId, args);
    
    if (!validation.allowed) {
      throw new Error(validation.reason || 'Request blocked');
    }

    // Sanitize string arguments
    const sanitizedArgs = args.map(arg => {
      if (typeof arg === 'string') {
        return InputSanitizer.sanitizeString(arg);
      }
      if (typeof arg === 'object' && arg !== null) {
        return InputSanitizer.sanitizeObject(arg);
      }
      return arg;
    });

    return handler(event, ...sanitizedArgs);
  });
}

/**
 * Wrap an IPC on listener with security validation
 */
export function secureOn(
  channel: string,
  handler: (event: IpcMainEvent, ...args: unknown[]) => void
): void {
  ipcMain.on(channel, (event, ...args) => {
    const senderId = event.sender?.id;
    const validation = validateRequest(channel, senderId, args);
    
    if (!validation.allowed) {
      log.warn(`[IPC Security] Blocked message on ${channel}: ${validation.reason}`);
      return;
    }

    handler(event, ...args);
  });
}

// ---------------------------------------------------------------------------
// Configuration API
// ---------------------------------------------------------------------------

export function configureInterceptor(updates: Partial<InterceptorConfig>): void {
  Object.assign(config, updates);
}

export function getInterceptorConfig(): Readonly<InterceptorConfig> {
  return { ...config };
}

export function getSecurityEvents(limit = 50): SecurityEvent[] {
  return securityEvents.slice(-limit);
}

export function getSenderSecurityStats(senderId: number): SenderStats | undefined {
  return senderStats.get(senderId);
}

export function clearSecurityStats(): void {
  senderStats.clear();
  channelStats.clear();
  securityEvents.length = 0;
}

export function addBypassChannel(channel: string): void {
  BYPASS_CHANNELS.add(channel);
}

export function removeBypassChannel(channel: string): void {
  BYPASS_CHANNELS.delete(channel);
}

// ---------------------------------------------------------------------------
// Initialize IPC handlers for security management
// ---------------------------------------------------------------------------

export function initializeSecurityHandlers(): void {
  ipcMain.handle('security:getInterceptorConfig', async () => {
    return getInterceptorConfig();
  });

  ipcMain.handle('security:getSecurityEvents', async (_, limit?: number) => {
    return getSecurityEvents(limit);
  });

  ipcMain.handle('security:getSenderStats', async (event) => {
    return getSenderSecurityStats(event.sender.id);
  });
}

// Cleanup stale stats periodically
setInterval(() => {
  const now = Date.now();
  const staleThreshold = now - 60000; // 1 minute

  for (const [senderId, stats] of senderStats.entries()) {
    if (stats.windowStart < staleThreshold && !stats.blocked) {
      senderStats.delete(senderId);
    }
  }

  for (const [channel, channelMap] of channelStats.entries()) {
    for (const [senderId, stats] of channelMap.entries()) {
      if (stats.windowStart < staleThreshold) {
        channelMap.delete(senderId);
      }
    }
    if (channelMap.size === 0) {
      channelStats.delete(channel);
    }
  }
}, 30000);
