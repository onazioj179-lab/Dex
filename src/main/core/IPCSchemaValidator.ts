// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- IPC Schema Validator
// ==========================================================================
// Rules 51-55: IPC Architecture
// 51. All IPC channels have typed schemas (validated at runtime)
// 52. Message size capped at 1MB (enforced via ipc-protocol.ts)
// 53. Rate limiting per channel (sliding window)
// 54. Error responses always include error code + message
// 55. No raw object passing -- serialize/deserialize at boundary
// ==========================================================================

import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IPCSchema {
  channel: string;
  direction: 'invoke' | 'send' | 'on';
  maxPayloadBytes: number;
  rateLimit: number;      // max calls per second
  validator?: (payload: any) => boolean;
}

interface RateLimitState {
  count: number;
  windowStart: number;
}

interface IPCError {
  code: string;
  message: string;
  channel: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Rule 51: Channel schema registry
// ---------------------------------------------------------------------------

const channelSchemas = new Map<string, IPCSchema>();
const rateLimits = new Map<string, RateLimitState>();
const errors: IPCError[] = [];
const MAX_ERROR_HISTORY = 200;

// Rule 52: Default max payload
const DEFAULT_MAX_PAYLOAD_BYTES = 1_048_576; // 1 MB

// ---------------------------------------------------------------------------
// Schema registration
// ---------------------------------------------------------------------------

export function registerIPCSchema(schema: IPCSchema): void {
  channelSchemas.set(schema.channel, schema);
}

export function registerIPCSchemas(schemas: IPCSchema[]): void {
  for (const schema of schemas) {
    channelSchemas.set(schema.channel, schema);
  }
}

// ---------------------------------------------------------------------------
// Rule 51 & 52: Validate incoming IPC message
// ---------------------------------------------------------------------------

/**
 * Validate IPC message against schema rules.
 * @param channel IPC channel name
 * @param payload Message payload
 * @param senderId Optional webContents ID for per-sender rate limiting (recommended)
 */
export function validateIPCMessage(
  channel: string,
  payload: any,
  senderId?: number
): { valid: boolean; error?: string } {
  const schema = channelSchemas.get(channel);

  // If no schema registered, allow but warn in dev
  if (!schema) {
    return { valid: true };
  }

  // Rule 52: Size check
  try {
    const serialized = JSON.stringify(payload);
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');
    if (sizeBytes > (schema.maxPayloadBytes || DEFAULT_MAX_PAYLOAD_BYTES)) {
      return { valid: false, error: `Payload too large: ${sizeBytes} bytes > ${schema.maxPayloadBytes} limit` };
    }
  } catch {
    return { valid: false, error: 'Payload not serializable' };
  }

  // Rule 53: Rate limiting (per-sender when senderId is available)
  const rateResult = checkRateLimit(channel, schema.rateLimit, senderId);
  if (!rateResult.allowed) {
    return { valid: false, error: `Rate limit exceeded for ${channel}: ${rateResult.count}/${schema.rateLimit} per second` };
  }

  // Rule 51: Custom validator
  if (schema.validator && !schema.validator(payload)) {
    return { valid: false, error: `Validation failed for ${channel}` };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Rule 53: Rate limiting (sliding window per channel AND per sender)
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a channel.
 * When senderId is provided, rate limits are enforced per-sender to prevent
 * one chatty renderer from exhausting the shared limit for all windows.
 */
function checkRateLimit(
  channel: string,
  maxPerSecond: number,
  senderId?: number
): { allowed: boolean; count: number } {
  if (maxPerSecond <= 0) return { allowed: true, count: 0 };

  const now = Date.now();
  // Scope the key per-sender when available for security isolation
  const key = senderId !== undefined ? `${channel}:${senderId}` : channel;
  let state = rateLimits.get(key);

  if (!state || now - state.windowStart > 1000) {
    state = { count: 0, windowStart: now };
    rateLimits.set(key, state);
  }

  state.count++;
  
  // Cleanup old entries periodically (every 100 new entries)
  if (rateLimits.size > 1000 && rateLimits.size % 100 === 0) {
    cleanupStaleRateLimits(now);
  }
  
  return { allowed: state.count <= maxPerSecond, count: state.count };
}

/** Remove rate limit entries older than 5 seconds to prevent memory growth */
function cleanupStaleRateLimits(now: number): void {
  for (const [key, state] of rateLimits.entries()) {
    if (now - state.windowStart > 5000) {
      rateLimits.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 54: Structured error response builder
// ---------------------------------------------------------------------------

export function buildIPCError(channel: string, code: string, message: string): IPCError {
  const error: IPCError = {
    code,
    message,
    channel,
    timestamp: Date.now(),
  };

  errors.push(error);
  if (errors.length > MAX_ERROR_HISTORY) {
    errors.splice(0, errors.length - MAX_ERROR_HISTORY);
  }

  return error;
}

export function getRecentIPCErrors(limit: number = 50): IPCError[] {
  return errors.slice(-limit);
}

// ---------------------------------------------------------------------------
// Rule 55: Serialize/deserialize at IPC boundary
// ---------------------------------------------------------------------------

export function serializeForIPC(data: any): string {
  try {
    return JSON.stringify(data);
  } catch {
    return JSON.stringify({ error: 'Serialization failed' });
  }
}

export function deserializeFromIPC<T = any>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function getIPCStats(): {
  registeredChannels: number;
  recentErrors: number;
  rateLimitStates: number;
} {
  return {
    registeredChannels: channelSchemas.size,
    recentErrors: errors.length,
    rateLimitStates: rateLimits.size,
  };
}

// ---------------------------------------------------------------------------
// Common DEX IPC schemas (Rule 51: pre-register known channels)
// ---------------------------------------------------------------------------

registerIPCSchemas([
  { channel: 'task-queue:enqueue', direction: 'invoke', maxPayloadBytes: 65536, rateLimit: 50 },
  { channel: 'task-queue:cancel', direction: 'invoke', maxPayloadBytes: 1024, rateLimit: 100 },
  { channel: 'task-queue:list', direction: 'invoke', maxPayloadBytes: 0, rateLimit: 30 },
  { channel: 'database-cluster:read', direction: 'invoke', maxPayloadBytes: 65536, rateLimit: 500 },
  { channel: 'database-cluster:write', direction: 'invoke', maxPayloadBytes: 262144, rateLimit: 200 },
  { channel: 'file-transfer:read', direction: 'invoke', maxPayloadBytes: 1048576, rateLimit: 50 },
  { channel: 'file-transfer:write', direction: 'invoke', maxPayloadBytes: 1048576, rateLimit: 50 },
  { channel: 'startup-sequencer:report', direction: 'invoke', maxPayloadBytes: 0, rateLimit: 10 },
  { channel: 'shutdown-sequencer:report', direction: 'invoke', maxPayloadBytes: 0, rateLimit: 10 },
  { channel: 'resource-governor:snapshot', direction: 'invoke', maxPayloadBytes: 0, rateLimit: 10 },
  { channel: 'performance:dashboard', direction: 'invoke', maxPayloadBytes: 0, rateLimit: 10 },
  { channel: 'event-bus:emit', direction: 'send', maxPayloadBytes: 65536, rateLimit: 200 },
  { channel: 'event-bus:subscribe', direction: 'invoke', maxPayloadBytes: 4096, rateLimit: 50 },
  { channel: 'encryption:encrypt', direction: 'invoke', maxPayloadBytes: 1048576, rateLimit: 50 },
  { channel: 'encryption:decrypt', direction: 'invoke', maxPayloadBytes: 1048576, rateLimit: 50 },
  { channel: 'search:instant', direction: 'invoke', maxPayloadBytes: 1024, rateLimit: 30 },
  { channel: 'analytics:snapshot', direction: 'invoke', maxPayloadBytes: 0, rateLimit: 10 },
  { channel: 'plugin:execute', direction: 'invoke', maxPayloadBytes: 262144, rateLimit: 20 },
  { channel: 'learning:predict', direction: 'invoke', maxPayloadBytes: 4096, rateLimit: 30 },
  { channel: 'gpu:getState', direction: 'invoke', maxPayloadBytes: 0, rateLimit: 60 },
]);
