// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * IPC Contracts - Type-safe IPC communication layer
 * Items 261-265: Typed IPC contracts, validation, error handling
 */

// ============================================================================
// IPC Channel Definitions
// ============================================================================

export const IPC_CHANNELS = {
  // File operations
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',
  FILE_EXISTS: 'file:exists',
  FILE_COPY: 'file:copy',
  FILE_MOVE: 'file:move',
  FILE_STAT: 'file:stat',
  FILE_WATCH: 'file:watch',
  FILE_UNWATCH: 'file:unwatch',
  
  // Directory operations
  DIR_READ: 'dir:read',
  DIR_CREATE: 'dir:create',
  DIR_DELETE: 'dir:delete',
  DIR_EXISTS: 'dir:exists',
  
  // Window operations
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_FULLSCREEN: 'window:fullscreen',
  WINDOW_FOCUS: 'window:focus',
  WINDOW_BOUNDS: 'window:bounds',
  
  // System operations
  SYSTEM_INFO: 'system:info',
  SYSTEM_MEMORY: 'system:memory',
  SYSTEM_CPU: 'system:cpu',
  SYSTEM_BATTERY: 'system:battery',
  SYSTEM_NETWORK: 'system:network',
  SYSTEM_STORAGE: 'system:storage',
  
  // Dialog operations
  DIALOG_OPEN: 'dialog:open',
  DIALOG_SAVE: 'dialog:save',
  DIALOG_MESSAGE: 'dialog:message',
  DIALOG_ERROR: 'dialog:error',
  
  // Clipboard operations
  CLIPBOARD_READ: 'clipboard:read',
  CLIPBOARD_WRITE: 'clipboard:write',
  CLIPBOARD_CLEAR: 'clipboard:clear',
  
  // Shell operations
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',
  SHELL_OPEN_PATH: 'shell:openPath',
  SHELL_TRASH: 'shell:trash',
  SHELL_BEEP: 'shell:beep',
  
  // App operations
  APP_VERSION: 'app:version',
  APP_PATH: 'app:path',
  APP_QUIT: 'app:quit',
  APP_RELAUNCH: 'app:relaunch',
  APP_FOCUS: 'app:focus',
  
  // Automation
  AUTO_EXECUTE: 'auto:execute',
  AUTO_SCHEDULE: 'auto:schedule',
  AUTO_CANCEL: 'auto:cancel',
  
  // Security
  SECURITY_ENCRYPT: 'security:encrypt',
  SECURITY_DECRYPT: 'security:decrypt',
  SECURITY_HASH: 'security:hash',
  SECURITY_VERIFY: 'security:verify',
  
  // Native modules
  NATIVE_AUDIO: 'native:audio',
  NATIVE_IMAGE: 'native:image',
  NATIVE_VIDEO: 'native:video',
  NATIVE_SYSTEM: 'native:system',
} as const;

export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// ============================================================================
// Request/Response Types
// ============================================================================

export interface IPCRequest<T = unknown> {
  id: string;
  channel: IPCChannel;
  payload: T;
  timestamp: number;
  timeout?: number;
}

export interface IPCResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: IPCError;
  duration: number;
}

export interface IPCError {
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
}

// ============================================================================
// Channel Payload Types
// ============================================================================

export interface FileReadRequest {
  path: string;
  encoding?: BufferEncoding;
}

export interface FileWriteRequest {
  path: string;
  data: string | Buffer;
  encoding?: BufferEncoding;
  mode?: number;
}

export interface FileStatResponse {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  created: number;
  modified: number;
  accessed: number;
  mode: number;
}

export interface DirReadRequest {
  path: string;
  recursive?: boolean;
  filter?: string;
}

export interface DirReadResponse {
  entries: Array<{
    name: string;
    path: string;
    isFile: boolean;
    isDirectory: boolean;
    size?: number;
    modified?: number;
  }>;
}

export interface DialogOpenRequest {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>;
}

export interface DialogSaveRequest {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface DialogMessageRequest {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  title?: string;
  message: string;
  detail?: string;
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
}

export interface SystemInfoResponse {
  platform: NodeJS.Platform;
  arch: string;
  hostname: string;
  username: string;
  homedir: string;
  tmpdir: string;
  cpus: number;
  memory: number;
  uptime: number;
}

export interface MemoryInfoResponse {
  total: number;
  free: number;
  used: number;
  percentage: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
}

export interface BatteryInfoResponse {
  charging: boolean;
  level: number;
  timeRemaining: number;
  powerSource: 'battery' | 'ac' | 'unknown';
}

// ============================================================================
// Type Guards
// ============================================================================

export function isIPCError(value: unknown): value is IPCError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  );
}

export function isIPCResponse<T>(value: unknown): value is IPCResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'success' in value &&
    'duration' in value
  );
}

// ============================================================================
// Error Codes
// ============================================================================

export const IPC_ERROR_CODES = {
  // General errors
  UNKNOWN: 'E_UNKNOWN',
  TIMEOUT: 'E_TIMEOUT',
  CANCELLED: 'E_CANCELLED',
  INVALID_REQUEST: 'E_INVALID_REQUEST',
  INVALID_CHANNEL: 'E_INVALID_CHANNEL',
  
  // File errors
  FILE_NOT_FOUND: 'E_FILE_NOT_FOUND',
  FILE_EXISTS: 'E_FILE_EXISTS',
  FILE_ACCESS_DENIED: 'E_FILE_ACCESS_DENIED',
  FILE_IS_DIRECTORY: 'E_FILE_IS_DIRECTORY',
  FILE_NOT_DIRECTORY: 'E_FILE_NOT_DIRECTORY',
  FILE_READ_ERROR: 'E_FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'E_FILE_WRITE_ERROR',
  
  // Path errors
  PATH_TRAVERSAL: 'E_PATH_TRAVERSAL',
  PATH_INVALID: 'E_PATH_INVALID',
  PATH_TOO_LONG: 'E_PATH_TOO_LONG',
  
  // Security errors
  SECURITY_VIOLATION: 'E_SECURITY_VIOLATION',
  ENCRYPTION_FAILED: 'E_ENCRYPTION_FAILED',
  DECRYPTION_FAILED: 'E_DECRYPTION_FAILED',
  
  // System errors
  SYSTEM_ERROR: 'E_SYSTEM_ERROR',
  MEMORY_ERROR: 'E_MEMORY_ERROR',
  NATIVE_ERROR: 'E_NATIVE_ERROR',
} as const;

export type IPCErrorCode = typeof IPC_ERROR_CODES[keyof typeof IPC_ERROR_CODES];

// ============================================================================
// Helper Functions
// ============================================================================

let requestIdCounter = 0;

export function generateRequestId(): string {
  return `ipc_${Date.now()}_${++requestIdCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createIPCRequest<T>(channel: IPCChannel, payload: T, timeout?: number): IPCRequest<T> {
  return {
    id: generateRequestId(),
    channel,
    payload,
    timestamp: Date.now(),
    timeout,
  };
}

export function createIPCResponse<T>(id: string, startTime: number, data: T): IPCResponse<T> {
  return {
    id,
    success: true,
    data,
    duration: Date.now() - startTime,
  };
}

export function createIPCError(id: string, startTime: number, code: IPCErrorCode, message: string, details?: unknown): IPCResponse<never> {
  return {
    id,
    success: false,
    error: { code, message, details },
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// Path Validation (Item 303: Path traversal guard)
// ============================================================================

const PATH_TRAVERSAL_PATTERNS = [
  /\.\./,           // Parent directory
  /^\/etc\//,       // System config (Linux)
  /^\/proc\//,      // Proc filesystem
  /^\/sys\//,       // Sys filesystem
  /^C:\\Windows/i,  // Windows system
  /^C:\\Program Files/i, // Program files
  /%[a-z0-9]+%/i,   // Environment variables
  /\0/,             // Null bytes
];

const ALLOWED_BASE_PATHS = [
  process.env.HOME || process.env.USERPROFILE || '',
  process.env.TEMP || process.env.TMP || '',
  process.env.APPDATA || '',
];

export function isPathSafe(requestedPath: string, allowedBasePaths: string[] = ALLOWED_BASE_PATHS): boolean {
  // Normalize path
  const normalized = requestedPath.replace(/\\/g, '/').toLowerCase();
  
  // Check for traversal patterns
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }
  
  // Verify path is within allowed directories
  if (allowedBasePaths.length > 0) {
    const isWithinAllowed = allowedBasePaths.some(base => {
      const normalizedBase = base.replace(/\\/g, '/').toLowerCase();
      return normalized.startsWith(normalizedBase);
    });
    if (!isWithinAllowed) {
      return false;
    }
  }
  
  return true;
}

export function sanitizePath(path: string): string {
  return path
    .replace(/\.\./g, '')
    .replace(/\0/g, '')
    .replace(/\/+/g, '/')
    .replace(/\\+/g, '\\');
}

// ============================================================================
// Nonce Management (Item 302: Nonce uniqueness enforcement)
// ============================================================================

const usedNonces = new Set<string>();
const NONCE_CLEANUP_INTERVAL = 60000; // 1 minute
const NONCE_MAX_AGE = 300000; // 5 minutes

interface NonceEntry {
  nonce: string;
  timestamp: number;
}

const nonceTimestamps = new Map<string, number>();

export function generateNonce(): string {
  const timestamp = Date.now();
  const random = crypto.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  
  const nonce = `${timestamp}-${random}`;
  
  if (usedNonces.has(nonce)) {
    // Collision detected, regenerate
    return generateNonce();
  }
  
  usedNonces.add(nonce);
  nonceTimestamps.set(nonce, timestamp);
  
  return nonce;
}

export function validateNonce(nonce: string): boolean {
  if (!nonce || typeof nonce !== 'string') {
    return false;
  }
  
  // Check if nonce was already used
  if (usedNonces.has(nonce)) {
    return false;
  }
  
  // Parse timestamp from nonce
  const parts = nonce.split('-');
  if (parts.length < 2) {
    return false;
  }
  
  const timestamp = parseInt(parts[0], 10);
  if (isNaN(timestamp)) {
    return false;
  }
  
  // Check if nonce is too old
  if (Date.now() - timestamp > NONCE_MAX_AGE) {
    return false;
  }
  
  // Mark nonce as used
  usedNonces.add(nonce);
  nonceTimestamps.set(nonce, timestamp);
  
  return true;
}

export function cleanupExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, timestamp] of nonceTimestamps) {
    if (now - timestamp > NONCE_MAX_AGE) {
      usedNonces.delete(nonce);
      nonceTimestamps.delete(nonce);
    }
  }
}

// Auto-cleanup expired nonces
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredNonces, NONCE_CLEANUP_INTERVAL);
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 1000,
};

export function checkRateLimit(key: string, config: RateLimitConfig = DEFAULT_RATE_LIMIT): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  
  if (!entry || now >= entry.resetTime) {
    rateLimits.set(key, { count: 1, resetTime: now + config.windowMs });
    return true;
  }
  
  if (entry.count >= config.maxRequests) {
    return false;
  }
  
  entry.count++;
  return true;
}
