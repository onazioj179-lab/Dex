// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Platform - Shared Validation Utilities
 * Type-safe validation for IPC communication and data integrity
 */

// ==================== VALIDATION TYPES ====================

export interface ValidationResult<T = unknown> {
  valid: boolean;
  value?: T;
  error?: string;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export type Validator<T> = (value: unknown) => ValidationResult<T>;

// ==================== PRIMITIVE VALIDATORS ====================

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

// ==================== STRING VALIDATORS ====================

export function validateString(
  value: unknown,
  options: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    allowEmpty?: boolean;
  } = {}
): ValidationResult<string> {
  const { minLength = 0, maxLength = 10000, pattern, allowEmpty = false } = options;

  if (!isString(value)) {
    return { valid: false, error: 'Expected a string' };
  }

  if (!allowEmpty && value.trim().length === 0) {
    return { valid: false, error: 'String cannot be empty' };
  }

  if (value.length < minLength) {
    return { valid: false, error: `String must be at least ${minLength} characters` };
  }

  if (value.length > maxLength) {
    return { valid: false, error: `String must not exceed ${maxLength} characters` };
  }

  if (pattern && !pattern.test(value)) {
    return { valid: false, error: 'String does not match required pattern' };
  }

  return { valid: true, value };
}

export function validateEmail(value: unknown): ValidationResult<string> {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return validateString(value, { pattern: emailPattern });
}

export function validateUrl(value: unknown): ValidationResult<string> {
  if (!isString(value)) {
    return { valid: false, error: 'Expected a URL string' };
  }

  try {
    new URL(value);
    return { valid: true, value };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

// ==================== PATH VALIDATORS ====================

const PATH_TRAVERSAL_PATTERNS = [
  /\.\./,           // Parent directory traversal
  /^\/etc/,         // Unix system paths
  /^\/root/,        // Unix root home
  /^C:\\Windows/i,  // Windows system paths
  /^C:\\Program Files/i,
  /%systemroot%/i,  // Windows environment variables
  /%windir%/i,
];

export function validateFilePath(value: unknown): ValidationResult<string> {
  if (!isString(value)) {
    return { valid: false, error: 'Expected a file path string' };
  }

  // Check for path traversal attacks
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(value)) {
      return { valid: false, error: 'Path contains unsafe patterns' };
    }
  }

  // Check for null bytes (path injection)
  if (value.includes('\0')) {
    return { valid: false, error: 'Path contains invalid characters' };
  }

  return { valid: true, value };
}

export function validateSafeFilename(value: unknown): ValidationResult<string> {
  if (!isString(value)) {
    return { valid: false, error: 'Expected a filename string' };
  }

  // Remove any path separators
  if (value.includes('/') || value.includes('\\')) {
    return { valid: false, error: 'Filename cannot contain path separators' };
  }

  // Check for reserved Windows names
  const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
  if (reserved.test(value)) {
    return { valid: false, error: 'Filename uses a reserved system name' };
  }

  // Check for invalid characters
  const invalidChars = /[<>:"|?*\x00-\x1f]/;
  if (invalidChars.test(value)) {
    return { valid: false, error: 'Filename contains invalid characters' };
  }

  return { valid: true, value };
}

// ==================== NUMBER VALIDATORS ====================

export function validateNumber(
  value: unknown,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
    positive?: boolean;
  } = {}
): ValidationResult<number> {
  const { min = -Infinity, max = Infinity, integer = false, positive = false } = options;

  if (!isNumber(value)) {
    return { valid: false, error: 'Expected a number' };
  }

  if (integer && !Number.isInteger(value)) {
    return { valid: false, error: 'Expected an integer' };
  }

  if (positive && value < 0) {
    return { valid: false, error: 'Expected a positive number' };
  }

  if (value < min) {
    return { valid: false, error: `Value must be at least ${min}` };
  }

  if (value > max) {
    return { valid: false, error: `Value must not exceed ${max}` };
  }

  return { valid: true, value };
}

export function validatePort(value: unknown): ValidationResult<number> {
  return validateNumber(value, { min: 1, max: 65535, integer: true });
}

// ==================== ARRAY VALIDATORS ====================

export function validateArray<T>(
  value: unknown,
  itemValidator: Validator<T>,
  options: {
    minLength?: number;
    maxLength?: number;
    unique?: boolean;
  } = {}
): ValidationResult<T[]> {
  const { minLength = 0, maxLength = 1000, unique = false } = options;

  if (!isArray(value)) {
    return { valid: false, error: 'Expected an array' };
  }

  if (value.length < minLength) {
    return { valid: false, error: `Array must have at least ${minLength} items` };
  }

  if (value.length > maxLength) {
    return { valid: false, error: `Array must not exceed ${maxLength} items` };
  }

  const validatedItems: T[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < value.length; i++) {
    const result = itemValidator(value[i]);
    if (result.valid && result.value !== undefined) {
      validatedItems.push(result.value);
    } else {
      errors.push({
        field: `[${i}]`,
        message: result.error || 'Invalid item',
        code: 'INVALID_ITEM',
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: `${errors.length} invalid items`, errors };
  }

  if (unique) {
    const seen = new Set<string>();
    for (const item of validatedItems) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        return { valid: false, error: 'Array must contain unique items' };
      }
      seen.add(key);
    }
  }

  return { valid: true, value: validatedItems };
}

// ==================== OBJECT VALIDATORS ====================

export function validateObject<T extends Record<string, unknown>>(
  value: unknown,
  schema: { [K in keyof T]: Validator<T[K]> },
  options: {
    strict?: boolean;  // Reject unknown properties
    partial?: boolean; // Allow missing properties
  } = {}
): ValidationResult<T> {
  const { strict = false, partial = false } = options;

  if (!isObject(value)) {
    return { valid: false, error: 'Expected an object' };
  }

  const result = {} as T;
  const errors: ValidationError[] = [];
  const schemaKeys = new Set(Object.keys(schema));

  // Validate each schema property
  for (const [key, validator] of Object.entries(schema) as [keyof T, Validator<T[keyof T]>][]) {
    const propValue = value[key as string];

    if (propValue === undefined) {
      if (!partial) {
        errors.push({
          field: key as string,
          message: `Missing required property: ${key as string}`,
          code: 'MISSING_PROPERTY',
        });
      }
      continue;
    }

    const propResult = validator(propValue);
    if (propResult.valid && propResult.value !== undefined) {
      result[key] = propResult.value;
    } else {
      errors.push({
        field: key as string,
        message: propResult.error || 'Invalid value',
        code: 'INVALID_PROPERTY',
      });
    }
  }

  // Check for unknown properties in strict mode
  if (strict) {
    for (const key of Object.keys(value)) {
      if (!schemaKeys.has(key)) {
        errors.push({
          field: key,
          message: `Unknown property: ${key}`,
          code: 'UNKNOWN_PROPERTY',
        });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: `${errors.length} validation errors`, errors };
  }

  return { valid: true, value: result };
}

// ==================== IPC-SPECIFIC VALIDATORS ====================

export interface IPCRequest {
  channel: string;
  payload?: unknown;
  timestamp?: number;
}

export function validateIPCRequest(value: unknown): ValidationResult<IPCRequest> {
  return validateObject(value, {
    channel: (v) => validateString(v, { minLength: 1, maxLength: 100 }),
    payload: (v) => ({ valid: true, value: v }), // Accept any payload
    timestamp: (v) => v === undefined ? { valid: true, value: undefined } : validateNumber(v),
  }, { partial: true });
}

// Rate limiting validation
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function validateRateLimit(
  identifier: string,
  options: {
    maxRequests: number;
    windowMs: number;
  }
): ValidationResult<void> {
  const { maxRequests, windowMs } = options;
  const now = Date.now();

  const entry = requestCounts.get(identifier);

  if (!entry || now >= entry.resetAt) {
    requestCounts.set(identifier, { count: 1, resetAt: now + windowMs });
    return { valid: true };
  }

  if (entry.count >= maxRequests) {
    return { valid: false, error: 'Rate limit exceeded' };
  }

  entry.count++;
  return { valid: true };
}

// ==================== UTILITY FUNCTIONS ====================

export function sanitize<T>(
  value: unknown,
  validator: Validator<T>,
  defaultValue: T
): T {
  const result = validator(value);
  return result.valid && result.value !== undefined ? result.value : defaultValue;
}

export function createValidator<T>(
  validator: Validator<T>
): { validate: Validator<T>; sanitize: (value: unknown, defaultValue: T) => T } {
  return {
    validate: validator,
    sanitize: (value, defaultValue) => sanitize(value, validator, defaultValue),
  };
}

// ==================== COMMON VALIDATORS ====================

export const validators = {
  string: createValidator(validateString),
  email: createValidator(validateEmail),
  url: createValidator(validateUrl),
  filePath: createValidator(validateFilePath),
  filename: createValidator(validateSafeFilename),
  number: createValidator((v) => validateNumber(v)),
  integer: createValidator((v) => validateNumber(v, { integer: true })),
  positiveInt: createValidator((v) => validateNumber(v, { integer: true, positive: true })),
  port: createValidator(validatePort),
  boolean: createValidator((v) => 
    isBoolean(v) ? { valid: true, value: v } : { valid: false, error: 'Expected boolean' }
  ),
};
