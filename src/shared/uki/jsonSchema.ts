// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Minimal argument schema validation (UKI tool-calling). Validates a parsed
 * arguments object against a flat field schema before a tool runs — catching
 * missing/mistyped args from the model. Not a full JSON-Schema engine; just the
 * practical subset. Pure: no DOM, no IO.
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface FieldSpec {
  type: FieldType;
  required?: boolean;
  /** Allowed values (for enums). */
  enum?: readonly unknown[];
}

export type ArgsSchema = Record<string, FieldSpec>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function typeOf(v: unknown): FieldType | 'null' | 'undefined' {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return 'array';
  return typeof v as FieldType;
}

/** Validate `args` against a flat field schema. */
export function validateArgs(args: unknown, schema: ArgsSchema): ValidationResult {
  const errors: string[] = [];
  if (typeOf(args) !== 'object') {
    return { valid: false, errors: ['arguments must be an object'] };
  }
  const obj = args as Record<string, unknown>;

  for (const [field, spec] of Object.entries(schema)) {
    const present = field in obj && obj[field] !== undefined;
    if (!present) {
      if (spec.required) errors.push(`missing required field: ${field}`);
      continue;
    }
    const actual = typeOf(obj[field]);
    if (actual !== spec.type) {
      errors.push(`field ${field} must be ${spec.type}, got ${actual}`);
      continue;
    }
    if (spec.enum && !spec.enum.includes(obj[field])) {
      errors.push(`field ${field} must be one of ${spec.enum.join(', ')}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Return only the schema-declared fields from an args object (drops extras). */
export function pickSchemaFields(args: Record<string, unknown>, schema: ArgsSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of Object.keys(schema)) {
    if (field in args) out[field] = args[field];
  }
  return out;
}
