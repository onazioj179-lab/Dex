// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - IPC Validation Middleware
// Input validation for all IPC channels
// ===========================================================================

import { ipcMain, IpcMainInvokeEvent } from 'electron';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type ValidatorFn = (data: unknown) => { valid: boolean; error?: string; sanitized?: unknown };

interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  sanitize?: boolean;
  enum?: unknown[];
  properties?: Record<string, ValidationRule>;
  items?: ValidationRule;
}

interface ChannelSchema {
  [channel: string]: {
    args?: ValidationRule[];
    rateLimit?: { maxCalls: number; windowMs: number };
    requiresConfirmation?: boolean;
    description?: string;
  };
}

// -----------------------------------------------------------------------------
// Rate Limiter
// -----------------------------------------------------------------------------

class RateLimiter {
  private calls: Map<string, number[]> = new Map();

  /**
   * @param senderId  Optional webContents ID — when provided the limit is
   *                  enforced per-window, preventing one chatty renderer
   *                  from exhausting the shared limit for all windows.
   */
  check(channel: string, maxCalls: number, windowMs: number, senderId?: number): boolean {
    const now = Date.now();
    // Scope the key per-sender when available, fall back to global channel
    const key = senderId !== undefined ? `${channel}:${senderId}` : channel;
    
    if (!this.calls.has(key)) {
      this.calls.set(key, []);
    }
    
    const timestamps = this.calls.get(key)!;
    
    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(t => now - t < windowMs);
    this.calls.set(key, validTimestamps);
    
    if (validTimestamps.length >= maxCalls) {
      return false; // Rate limited
    }
    
    validTimestamps.push(now);
    return true;
  }
  
  reset(channel?: string): void {
    if (channel) {
      this.calls.delete(channel);
    } else {
      this.calls.clear();
    }
  }
}

// -----------------------------------------------------------------------------
// Input Sanitizer
// -----------------------------------------------------------------------------

export class InputSanitizer {
  // Remove potentially dangerous characters for XSS
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .replace(/data:/gi, '') // Remove data: protocol
      .trim();
  }
  
  // Sanitize file paths to prevent traversal — reject malicious input entirely
  static sanitizePath(input: string): string {
    if (typeof input !== 'string') return '';
    
    // Block null bytes
    if (input.includes('\0')) return '';
    
    // Normalize separators to forward slash for consistent checking
    const normalized = input.replace(/\\/g, '/');
    
    // Reject any path containing traversal sequences (../ or .. at end)
    if (/(?:^|\/)\.\.(?:\/|$)/.test(normalized)) return '';
    
    // Remove leading slashes/backslashes to prevent absolute path injection
    const sanitized = input.replace(/^[\/\\]+/, '');
    
    return sanitized.trim();
  }
  
  // Sanitize object recursively
  static sanitizeObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  }
  
  // Validate email format
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  // Validate URL format
  static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
}

// -----------------------------------------------------------------------------
// Validator
// -----------------------------------------------------------------------------

export class IPCValidator {
  private rateLimiter = new RateLimiter();
  private schemas: ChannelSchema = {};
  private validationErrors: Array<{ channel: string; error: string; timestamp: number }> = [];
  
  constructor() {
    this.initializeSchemas();
  }
  
  private initializeSchemas(): void {
    // Define validation schemas for critical channels
    this.schemas = {
      // File operations - high risk
      'file:read': {
        args: [{ type: 'string', required: true, maxLength: 1000, sanitize: true }],
        rateLimit: { maxCalls: 100, windowMs: 60000 },
        description: 'Read file contents',
      },
      'file:write': {
        args: [
          { type: 'string', required: true, maxLength: 1000, sanitize: true },
          { type: 'any', required: true },
        ],
        rateLimit: { maxCalls: 50, windowMs: 60000 },
        requiresConfirmation: true,
        description: 'Write file contents',
      },
      'file:delete': {
        args: [{ type: 'string', required: true, maxLength: 1000, sanitize: true }],
        rateLimit: { maxCalls: 20, windowMs: 60000 },
        requiresConfirmation: true,
        description: 'Delete file',
      },
      
      // Shell operations - critical risk
      'shell:openExternal': {
        args: [{ type: 'string', required: true, maxLength: 2000, pattern: /^https?:\/\// }],
        rateLimit: { maxCalls: 10, windowMs: 60000 },
        description: 'Open external URL',
      },
      'shell:openPath': {
        args: [{ type: 'string', required: true, maxLength: 1000, sanitize: true }],
        rateLimit: { maxCalls: 20, windowMs: 60000 },
        description: 'Open file path',
      },
      
      // Action execution - medium risk
      'actions:execute': {
        args: [{ type: 'object', required: true }],
        rateLimit: { maxCalls: 30, windowMs: 60000 },
        description: 'Execute automation action',
      },
      
      // Workflow execution
      'workflows:execute': {
        args: [{ type: 'string', required: true, maxLength: 100 }],
        rateLimit: { maxCalls: 10, windowMs: 60000 },
        description: 'Execute workflow',
      },
      
      // Data operations
      'data:save': {
        args: [
          { type: 'string', required: true, maxLength: 50 },
          { type: 'any', required: true },
        ],
        rateLimit: { maxCalls: 100, windowMs: 60000 },
        description: 'Save data to store',
      },
      
      // Script execution - high risk
      'scripts:execute': {
        args: [{ type: 'string', required: true, maxLength: 50000 }],
        rateLimit: { maxCalls: 5, windowMs: 60000 },
        requiresConfirmation: true,
        description: 'Execute user script',
      },
      
      // Transfer operations
      'transfer:start': {
        args: [{ type: 'object', required: true }],
        rateLimit: { maxCalls: 10, windowMs: 60000 },
        description: 'Start file transfer',
      },
      
      // System operations
      'power:closeProcess': {
        args: [
          { type: 'number', required: true, min: 1 },
          { type: 'boolean', required: false },
        ],
        rateLimit: { maxCalls: 10, windowMs: 60000 },
        requiresConfirmation: true,
        description: 'Close system process',
      },
    };
  }
  
  // Validate a single value against a rule
  private validateValue(value: unknown, rule: ValidationRule): { valid: boolean; error?: string; sanitized?: unknown } {
    // Check required
    if (rule.required && (value === undefined || value === null)) {
      return { valid: false, error: 'Required value is missing' };
    }
    
    // Allow optional undefined values
    if (!rule.required && (value === undefined || value === null)) {
      return { valid: true, sanitized: value };
    }
    
    let sanitized = value;
    
    // Type checking
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          return { valid: false, error: `Expected string, got ${typeof value}` };
        }
        
        // Sanitize if requested
        if (rule.sanitize) {
          sanitized = InputSanitizer.sanitizeString(value);
        }
        
        // Length checks
        if (rule.minLength && value.length < rule.minLength) {
          return { valid: false, error: `String too short (min: ${rule.minLength})` };
        }
        if (rule.maxLength && value.length > rule.maxLength) {
          return { valid: false, error: `String too long (max: ${rule.maxLength})` };
        }
        
        // Pattern check
        if (rule.pattern && !rule.pattern.test(value)) {
          return { valid: false, error: 'String does not match required pattern' };
        }
        
        // Enum check
        if (rule.enum && !rule.enum.includes(value)) {
          return { valid: false, error: `Value must be one of: ${rule.enum.join(', ')}` };
        }
        break;
        
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return { valid: false, error: `Expected number, got ${typeof value}` };
        }
        if (rule.min !== undefined && value < rule.min) {
          return { valid: false, error: `Number too small (min: ${rule.min})` };
        }
        if (rule.max !== undefined && value > rule.max) {
          return { valid: false, error: `Number too large (max: ${rule.max})` };
        }
        break;
        
      case 'boolean':
        if (typeof value !== 'boolean') {
          return { valid: false, error: `Expected boolean, got ${typeof value}` };
        }
        break;
        
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return { valid: false, error: `Expected object, got ${typeof value}` };
        }
        
        // Sanitize object
        if (rule.sanitize) {
          sanitized = InputSanitizer.sanitizeObject(value);
        }
        
        // Validate properties if defined
        if (rule.properties) {
          const obj = value as Record<string, unknown>;
          const sanitizedObj: Record<string, unknown> = {};
          
          for (const [key, propRule] of Object.entries(rule.properties)) {
            const result = this.validateValue(obj[key], propRule);
            if (!result.valid) {
              return { valid: false, error: `Property '${key}': ${result.error}` };
            }
            sanitizedObj[key] = result.sanitized;
          }
          sanitized = sanitizedObj;
        }
        break;
        
      case 'array':
        if (!Array.isArray(value)) {
          return { valid: false, error: `Expected array, got ${typeof value}` };
        }
        
        // Validate items if rule defined
        if (rule.items) {
          const sanitizedArray: unknown[] = [];
          for (let i = 0; i < value.length; i++) {
            const result = this.validateValue(value[i], rule.items);
            if (!result.valid) {
              return { valid: false, error: `Array item ${i}: ${result.error}` };
            }
            sanitizedArray.push(result.sanitized);
          }
          sanitized = sanitizedArray;
        }
        break;
        
      case 'any':
        // Any type allowed, but still sanitize if requested
        if (rule.sanitize) {
          sanitized = InputSanitizer.sanitizeObject(value);
        }
        break;
    }
    
    return { valid: true, sanitized };
  }
  
  // Validate IPC call
  validate(channel: string, args: unknown[], senderId?: number): { 
    valid: boolean; 
    error?: string; 
    sanitizedArgs?: unknown[];
    requiresConfirmation?: boolean;
  } {
    const schema = this.schemas[channel];
    
    // If no schema defined, allow with basic sanitization
    if (!schema) {
      return { 
        valid: true, 
        sanitizedArgs: args.map(arg => InputSanitizer.sanitizeObject(arg)),
      };
    }
    
    // Check rate limit (per-sender when senderId is available)
    if (schema.rateLimit) {
      const allowed = this.rateLimiter.check(
        channel,
        schema.rateLimit.maxCalls,
        schema.rateLimit.windowMs,
        senderId
      );
      
      if (!allowed) {
        this.logValidationError(channel, 'Rate limit exceeded');
        return { valid: false, error: 'Rate limit exceeded. Please try again later.' };
      }
    }
    
    // Validate arguments
    if (schema.args) {
      if (args.length < schema.args.filter(a => a.required).length) {
        return { valid: false, error: 'Missing required arguments' };
      }
      
      const sanitizedArgs: unknown[] = [];
      
      for (let i = 0; i < schema.args.length; i++) {
        const rule = schema.args[i];
        const arg = args[i];
        
        const result = this.validateValue(arg, rule);
        if (!result.valid) {
          this.logValidationError(channel, `Argument ${i}: ${result.error}`);
          return { valid: false, error: `Invalid argument ${i}: ${result.error}` };
        }
        
        sanitizedArgs.push(result.sanitized);
      }
      
      return { 
        valid: true, 
        sanitizedArgs,
        requiresConfirmation: schema.requiresConfirmation,
      };
    }
    
    return { valid: true, sanitizedArgs: args };
  }
  
  private logValidationError(channel: string, error: string): void {
    this.validationErrors.push({
      channel,
      error,
      timestamp: Date.now(),
    });
    
    // Keep only last 100 errors
    if (this.validationErrors.length > 100) {
      this.validationErrors = this.validationErrors.slice(-100);
    }
    
    // Logged via structured error array; electron-log import avoided to keep this module lightweight
  }
  
  // Get validation errors for debugging
  getErrors(): Array<{ channel: string; error: string; timestamp: number }> {
    return [...this.validationErrors];
  }
  
  // Add custom schema
  addSchema(channel: string, schema: ChannelSchema[string]): void {
    this.schemas[channel] = schema;
  }
  
  // Reset rate limits (for testing)
  resetRateLimits(): void {
    this.rateLimiter.reset();
  }
}

// Singleton instance
export const ipcValidator = new IPCValidator();

// -----------------------------------------------------------------------------
// Middleware Helper
// -----------------------------------------------------------------------------

/**
 * Wrap an IPC handler with validation
 */
export function withValidation<T>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>
): (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> {
  return async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<T> => {
    // Pass sender ID so rate limits are enforced per-window
    const senderId = event.sender?.id;
    const validation = ipcValidator.validate(channel, args, senderId);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.error}`);
    }
    
    // Use sanitized arguments
    return handler(event, ...(validation.sanitizedArgs || args));
  };
}
