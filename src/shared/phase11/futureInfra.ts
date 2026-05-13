// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 11 - Future infrastructure readiness primitives.
 *
 * Capability-based PluginSandbox + minimal in-process ServiceMesh registry.
 * No process isolation here; this is the policy + lookup substrate that
 * downstream phases will implement on top of OS-level boundaries.
 */

export type Capability =
  | 'fs.read' | 'fs.write' | 'net.http' | 'net.ws'
  | 'process.spawn' | 'clipboard.read' | 'clipboard.write'
  | 'notifications.show' | 'shell.command' | 'gpu.compute';

export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly capabilities: readonly Capability[];
  readonly origin?: string;
}

export interface CapabilityGrant {
  readonly pluginId: string;
  readonly capability: Capability;
  readonly grantedAt: number;
  readonly expiresAt?: number;
}

export class PluginSandbox {
  private readonly manifests = new Map<string, PluginManifest>();
  private readonly grants = new Map<string, CapabilityGrant>();

  install(manifest: PluginManifest): void {
    if (!manifest.id) throw new Error('plugin id required');
    if (this.manifests.has(manifest.id)) throw new Error(`plugin ${manifest.id} already installed`);
    if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
      throw new Error('manifest capabilities must be unique');
    }
    this.manifests.set(manifest.id, manifest);
  }

  uninstall(pluginId: string): void {
    if (!this.manifests.delete(pluginId)) return;
    for (const k of Array.from(this.grants.keys())) {
      if (k.startsWith(`${pluginId}|`)) this.grants.delete(k);
    }
  }

  grant(pluginId: string, capability: Capability, now: number = Date.now(), expiresAt?: number): CapabilityGrant {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) throw new Error(`unknown plugin ${pluginId}`);
    if (!manifest.capabilities.includes(capability)) {
      throw new Error(`plugin ${pluginId} did not declare ${capability}`);
    }
    const grant: CapabilityGrant = { pluginId, capability, grantedAt: now, expiresAt };
    this.grants.set(`${pluginId}|${capability}`, grant);
    return grant;
  }

  revoke(pluginId: string, capability: Capability): boolean {
    return this.grants.delete(`${pluginId}|${capability}`);
  }

  check(pluginId: string, capability: Capability, now: number = Date.now()): boolean {
    const g = this.grants.get(`${pluginId}|${capability}`);
    if (!g) return false;
    if (g.expiresAt != null && g.expiresAt <= now) {
      this.grants.delete(`${pluginId}|${capability}`);
      return false;
    }
    return true;
  }

  enforce(pluginId: string, capability: Capability, now: number = Date.now()): void {
    if (!this.check(pluginId, capability, now)) {
      throw new Error(`plugin ${pluginId} lacks capability ${capability}`);
    }
  }

  installedPlugins(): PluginManifest[] { return Array.from(this.manifests.values()); }
  pluginCount(): number { return this.manifests.size; }
}

export interface ServiceDescriptor<T = unknown> {
  readonly name: string;
  readonly version: string;
  readonly instance: T;
}

export class ServiceMesh {
  private readonly services = new Map<string, ServiceDescriptor[]>();

  register<T>(descriptor: ServiceDescriptor<T>): () => void {
    if (!descriptor.name) throw new Error('service name required');
    if (!/^\d+\.\d+\.\d+$/.test(descriptor.version)) {
      throw new Error('version must be semver-major.minor.patch');
    }
    const list = this.services.get(descriptor.name) ?? [];
    if (list.some((s) => s.version === descriptor.version)) {
      throw new Error(`service ${descriptor.name}@${descriptor.version} already registered`);
    }
    list.push(descriptor as ServiceDescriptor);
    this.services.set(descriptor.name, list);
    return () => {
      const cur = this.services.get(descriptor.name);
      if (!cur) return;
      const next = cur.filter((s) => s.version !== descriptor.version);
      if (next.length === 0) this.services.delete(descriptor.name);
      else this.services.set(descriptor.name, next);
    };
  }

  /** Resolve highest semver-compatible version for `name` matching `requirement` (caret/exact/any). */
  resolve<T = unknown>(name: string, requirement: string = '*'): ServiceDescriptor<T> | null {
    const list = this.services.get(name);
    if (!list || list.length === 0) return null;
    const matches = list
      .filter((s) => satisfies(s.version, requirement))
      .sort((a, b) => compareVersions(b.version, a.version));
    return (matches[0] as ServiceDescriptor<T> | undefined) ?? null;
  }

  list(): string[] { return Array.from(this.services.keys()); }
  versions(name: string): string[] {
    return (this.services.get(name) ?? []).map((s) => s.version).sort(compareVersions);
  }
}

function parseVersion(v: string): [number, number, number] {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`invalid semver ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  }
  return 0;
}

function satisfies(version: string, requirement: string): boolean {
  if (requirement === '*' || requirement === '') return true;
  if (requirement.startsWith('^')) {
    const target = parseVersion(requirement.slice(1));
    const v = parseVersion(version);
    if (v[0] !== target[0]) return false;
    if (v[1] < target[1]) return false;
    if (v[1] === target[1] && v[2] < target[2]) return false;
    return true;
  }
  return version === requirement;
}
