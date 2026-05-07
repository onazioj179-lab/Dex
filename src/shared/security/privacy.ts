// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave I v4.0.1 - Privacy + IPC validation helpers.

// ---------- Schema validators (zero-dep, JSON-shape) ----------

export type SchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export interface FieldSchema {
  type: SchemaType;
  optional?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: ReadonlyArray<unknown>;
  items?: FieldSchema;
  properties?: Record<string, FieldSchema>;
  additionalProperties?: boolean;
  maxLength?: number;
}

export interface ValidationProblem { path: string; message: string }

export function validateSchema(value: unknown, schema: FieldSchema, path: string = '$'): ValidationProblem[] {
  const out: ValidationProblem[] = [];
  if (value === undefined || value === null) {
    if (schema.optional || schema.type === 'null') return out;
    out.push({ path, message: `expected ${schema.type}, got ${value === null ? 'null' : 'undefined'}` });
    return out;
  }
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') { out.push({ path, message: 'expected string' }); break; }
      if (schema.min !== undefined && value.length < schema.min) out.push({ path, message: `min length ${schema.min}` });
      if (schema.max !== undefined && value.length > schema.max) out.push({ path, message: `max length ${schema.max}` });
      if (schema.maxLength !== undefined && value.length > schema.maxLength) out.push({ path, message: `max length ${schema.maxLength}` });
      if (schema.pattern && !schema.pattern.test(value)) out.push({ path, message: 'pattern mismatch' });
      if (schema.enum && !schema.enum.includes(value)) out.push({ path, message: 'not in enum' });
      break;
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) { out.push({ path, message: 'expected number' }); break; }
      if (schema.type === 'integer' && !Number.isInteger(value)) out.push({ path, message: 'expected integer' });
      if (schema.min !== undefined && value < schema.min) out.push({ path, message: `min ${schema.min}` });
      if (schema.max !== undefined && value > schema.max) out.push({ path, message: `max ${schema.max}` });
      if (schema.enum && !schema.enum.includes(value)) out.push({ path, message: 'not in enum' });
      break;
    }
    case 'boolean':
      if (typeof value !== 'boolean') out.push({ path, message: 'expected boolean' });
      break;
    case 'array': {
      if (!Array.isArray(value)) { out.push({ path, message: 'expected array' }); break; }
      if (schema.min !== undefined && value.length < schema.min) out.push({ path, message: `min ${schema.min} items` });
      if (schema.max !== undefined && value.length > schema.max) out.push({ path, message: `max ${schema.max} items` });
      if (schema.items) {
        for (let i = 0; i < value.length; i++) out.push(...validateSchema(value[i], schema.items, `${path}[${i}]`));
      }
      break;
    }
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) { out.push({ path, message: 'expected object' }); break; }
      const obj = value as Record<string, unknown>;
      if (schema.properties) {
        for (const [k, sub] of Object.entries(schema.properties)) {
          out.push(...validateSchema(obj[k], sub, `${path}.${k}`));
        }
        if (schema.additionalProperties === false) {
          for (const k of Object.keys(obj)) {
            if (!(k in schema.properties)) out.push({ path: `${path}.${k}`, message: 'unknown property' });
          }
        }
      }
      break;
    }
  }
  return out;
}

// ---------- Log redaction ----------

const SECRET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'github_pat', re: /ghp_[A-Za-z0-9]{20,}/g },
  { name: 'github_oauth', re: /gho_[A-Za-z0-9]{20,}/g },
  { name: 'aws_access_key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'aws_secret', re: /(?<![A-Za-z0-9])[A-Za-z0-9/+]{40}(?![A-Za-z0-9])/g },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_=-]{10,}\.[A-Za-z0-9_=-]{10,}\.[A-Za-z0-9_.+/=-]{5,}/g },
  { name: 'openai', re: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'email', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'card', re: /\b(?:\d[ -]*?){13,19}\b/g },
  { name: 'phone_e164', re: /\+\d{8,15}\b/g },
  { name: 'win_path_user', re: /C:\\Users\\[A-Za-z0-9_.\- ]+/g },
  { name: 'mac_path_user', re: /\/Users\/[A-Za-z0-9_.\- ]+/g },
  { name: 'linux_path_user', re: /\/home\/[A-Za-z0-9_.\- ]+/g },
];

export interface RedactionResult { text: string; counts: Record<string, number> }

export function redactSecrets(input: string): RedactionResult {
  const counts: Record<string, number> = {};
  let text = input;
  for (const { name, re } of SECRET_PATTERNS) {
    text = text.replace(re, () => {
      counts[name] = (counts[name] ?? 0) + 1;
      return `[redacted:${name}]`;
    });
  }
  return { text, counts };
}

export function redactObject<T>(obj: T, secretKeys: ReadonlyArray<string> = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization', 'cookie']): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => redactObject(v, secretKeys)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (secretKeys.some(s => k.toLowerCase().includes(s.toLowerCase()))) {
      out[k] = typeof v === 'string' ? '[redacted]' : null;
    } else if (v && typeof v === 'object') {
      out[k] = redactObject(v, secretKeys);
    } else if (typeof v === 'string') {
      out[k] = redactSecrets(v).text;
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

// ---------- Permission timeline ----------

export type PermissionScope = 'fs' | 'network' | 'camera' | 'microphone' | 'location' | 'clipboard' | 'notifications' | 'shell' | 'biometric';

export interface PermissionGrant { appId: string; scope: PermissionScope; grantedAt: number; expiresAt: number | null; oneShot: boolean; reason?: string }

export interface PermissionLogEntry { appId: string; scope: PermissionScope; at: number; outcome: 'granted' | 'denied' | 'expired' }

export function isGrantValid(grant: PermissionGrant, now: number): boolean {
  if (grant.expiresAt !== null && now >= grant.expiresAt) return false;
  return true;
}

export function pruneExpiredGrants(grants: ReadonlyArray<PermissionGrant>, now: number): { active: PermissionGrant[]; expired: PermissionGrant[] } {
  const active: PermissionGrant[] = [];
  const expired: PermissionGrant[] = [];
  for (const g of grants) (isGrantValid(g, now) ? active : expired).push(g);
  return { active, expired };
}

// ---------- Update verification helpers ----------

export interface UpdateMetadata {
  version: string;
  sha256: string;
  size: number;
  signedBy?: string;
}

export function semverCompare(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0; const vb = pb[i] || 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

export function isValidSha256(hex: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(hex);
}

export function isValidVersionString(v: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(v);
}

export function evaluateUpdate(meta: UpdateMetadata, currentVersion: string, expectedSigner?: string): { ok: boolean; reason?: string } {
  if (!isValidVersionString(meta.version)) return { ok: false, reason: 'invalid version string' };
  if (!isValidSha256(meta.sha256)) return { ok: false, reason: 'invalid sha256' };
  if (meta.size <= 0) return { ok: false, reason: 'invalid size' };
  if (expectedSigner && meta.signedBy !== expectedSigner) return { ok: false, reason: 'signer mismatch' };
  if (semverCompare(meta.version, currentVersion) === 0) return { ok: false, reason: 'same version' };
  return { ok: true };
}
