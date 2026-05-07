// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Plugin manifest schema + capability tokens + typed event bus.
 */

// DEX v3.8.9 - plugin manifest + permissions

export type PluginCapability =
  | 'fs:read' | 'fs:write'
  | 'net:fetch'
  | 'ipc'
  | 'shell:exec'
  | 'clipboard'
  | 'notifications'
  | 'storage';

export interface PluginManifest {
  id: string;                            // reverse-DNS, e.g. "com.example.tool"
  name: string;
  version: string;                       // semver
  author: string;
  /** Lowest DEX runtime this plugin supports. */
  dexVersion: string;
  entryPoint: string;                    // path inside the plugin bundle
  capabilities: PluginCapability[];
  /** SHA-256 of the bundle, set by the installer. */
  bundleSha256?: string;
  description?: string;
  homepage?: string;
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ID_RE = /^[a-z0-9]+(?:\.[a-z0-9]+)+$/;

export type ManifestProblem = string;

export function validateManifest(m: Partial<PluginManifest>): { ok: boolean; problems: ManifestProblem[] } {
  const problems: ManifestProblem[] = [];
  if (!m.id || !ID_RE.test(m.id)) problems.push('id must be reverse-DNS (a.b.c)');
  if (!m.name) problems.push('name required');
  if (!m.version || !SEMVER_RE.test(m.version)) problems.push('version must be semver');
  if (!m.author) problems.push('author required');
  if (!m.dexVersion || !SEMVER_RE.test(m.dexVersion)) problems.push('dexVersion must be semver');
  if (!m.entryPoint) problems.push('entryPoint required');
  if (!Array.isArray(m.capabilities)) problems.push('capabilities must be an array');
  return { ok: problems.length === 0, problems };
}

export interface CapabilityGrant {
  pluginId: string;
  capability: PluginCapability;
  grantedAt: number;
  /** Optional grant scope: e.g. for fs:read, the directory. */
  scope?: string;
}

export interface CapabilityLedger {
  grants: CapabilityGrant[];
}

export function createCapabilityLedger(): CapabilityLedger { return { grants: [] }; }

export function grantCapability(ledger: CapabilityLedger, g: Omit<CapabilityGrant, 'grantedAt'> & { grantedAt?: number }): CapabilityLedger {
  return { grants: [...ledger.grants, { ...g, grantedAt: g.grantedAt ?? Date.now() }] };
}

export function revokeCapability(ledger: CapabilityLedger, pluginId: string, capability: PluginCapability): CapabilityLedger {
  return { grants: ledger.grants.filter((g) => !(g.pluginId === pluginId && g.capability === capability)) };
}

export function hasCapability(ledger: CapabilityLedger, pluginId: string, capability: PluginCapability): boolean {
  return ledger.grants.some((g) => g.pluginId === pluginId && g.capability === capability);
}
