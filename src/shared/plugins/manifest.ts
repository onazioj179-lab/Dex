// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Plugin manifest + validation (GOAL-6D Plugin System). Defines the contract a
 * DEX plugin declares — id, name, version, requested permissions, and what it
 * contributes (commands/panels/workflows/widgets). Pure validation so the
 * marketplace/loader can reject bad manifests before activating a plugin.
 */

export const KNOWN_PERMISSIONS = [
  'commands', 'panels', 'workflows', 'widgets',
  'files', 'network', 'ai', 'clipboard', 'notifications',
] as const;
export type PluginPermission = (typeof KNOWN_PERMISSIONS)[number];

export interface PluginContributes {
  commands?: { id: string; title: string }[];
  panels?: { id: string; title: string }[];
  workflows?: string[];
  widgets?: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  permissions?: PluginPermission[];
  contributes?: PluginContributes;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+/;

/** Validate an untrusted plugin manifest. Returns all problems (never throws). */
export function validateManifest(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['manifest must be an object'] };
  }
  const m = input as Record<string, unknown>;

  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) {
    errors.push('id must be a slug (a-z 0-9 . _ -, 2-64 chars)');
  }
  if (typeof m.name !== 'string' || m.name.trim() === '') {
    errors.push('name is required');
  }
  if (typeof m.version !== 'string' || !SEMVER_RE.test(m.version)) {
    errors.push('version must be semver (x.y.z)');
  }

  if (m.permissions !== undefined) {
    if (!Array.isArray(m.permissions)) {
      errors.push('permissions must be an array');
    } else {
      for (const p of m.permissions) {
        if (!KNOWN_PERMISSIONS.includes(p as PluginPermission)) {
          errors.push(`unknown permission: ${String(p)}`);
        }
      }
    }
  }

  if (m.contributes !== undefined) {
    if (typeof m.contributes !== 'object' || m.contributes === null) {
      errors.push('contributes must be an object');
    } else {
      const c = m.contributes as Record<string, unknown>;
      if (c.commands !== undefined) {
        if (!Array.isArray(c.commands)) {
          errors.push('contributes.commands must be an array');
        } else {
          c.commands.forEach((cmd, i) => {
            const o = cmd as Record<string, unknown> | null;
            if (!o || typeof o.id !== 'string' || typeof o.title !== 'string') {
              errors.push(`contributes.commands[${i}] needs string id + title`);
            }
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
