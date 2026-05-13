// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Plugin sandbox postMessage protocol + permission gating
 * (T7-011 CSP iframe is shell-side; this module provides the protocol +
 * permission/quota/network-allowlist gates the host enforces).
 *
 * Use:
 *   const sb = new PluginSandbox({ pluginId, permissions, networkAllow, quotaBytes });
 *   sb.handleMessage(rawEvent.data);  // returns response or null
 */

export type PluginPermission =
  | 'storage' | 'network' | 'clipboard' | 'notifications' | 'fs.read' | 'fs.write'
  | 'mic' | 'camera' | 'screen' | 'mainProcess';

export interface PluginManifest {
  pluginId: string;
  permissions: readonly PluginPermission[];
  /** Allowlist of host:port patterns. ['*.example.com', 'api.dex.local'] */
  networkAllow: readonly string[];
  /** Storage quota in bytes. */
  quotaBytes: number;
}

export type PluginRequest =
  | { kind: 'storage.get'; key: string }
  | { kind: 'storage.set'; key: string; value: string }
  | { kind: 'network.fetch'; url: string; method?: string; body?: string }
  | { kind: 'notify'; title: string; body?: string };

export interface PluginResponseOk<T = unknown> { ok: true; data: T; }
export interface PluginResponseErr { ok: false; error: string; }
export type PluginResponse<T = unknown> = PluginResponseOk<T> | PluginResponseErr;

export class PluginSandbox {
  private readonly storage = new Map<string, string>();
  private bytesUsed = 0;
  constructor(private readonly manifest: PluginManifest) {}

  has(p: PluginPermission): boolean { return this.manifest.permissions.includes(p); }

  isHostAllowed(url: string): boolean {
    let host: string;
    try { host = new URL(url).host; } catch { return false; }
    for (const pattern of this.manifest.networkAllow) {
      if (matchesHost(pattern, host)) return true;
    }
    return false;
  }

  storageGet(key: string): PluginResponse<string | null> {
    if (!this.has('storage')) return deny('storage');
    return { ok: true, data: this.storage.get(key) ?? null };
  }

  storageSet(key: string, value: string): PluginResponse<true> {
    if (!this.has('storage')) return deny('storage');
    const next = this.bytesUsed - (this.storage.get(key)?.length ?? 0) + value.length;
    if (next > this.manifest.quotaBytes) return { ok: false, error: 'quota exceeded' };
    this.storage.set(key, value);
    this.bytesUsed = next;
    return { ok: true, data: true };
  }

  fetchUrl(url: string): PluginResponse<{ allowed: true }> {
    if (!this.has('network')) return deny('network');
    if (!this.isHostAllowed(url)) return { ok: false, error: 'host not in allowlist' };
    return { ok: true, data: { allowed: true } };
  }

  /** Validates and dispatches a serialized request payload. Returns the
   * response that the shell should `postMessage` back to the iframe. */
  handleMessage(data: unknown): PluginResponse<unknown> {
    if (!data || typeof data !== 'object') return { ok: false, error: 'invalid payload' };
    const req = data as PluginRequest;
    switch (req.kind) {
      case 'storage.get': return this.storageGet(req.key);
      case 'storage.set': return this.storageSet(req.key, req.value);
      case 'network.fetch': return this.fetchUrl(req.url);
      case 'notify':
        if (!this.has('notifications')) return deny('notifications');
        return { ok: true, data: true };
      default:
        return { ok: false, error: 'unknown kind' };
    }
  }

  bytes(): number { return this.bytesUsed; }
}

function deny(perm: PluginPermission): PluginResponseErr {
  return { ok: false, error: `permission denied: ${perm}` };
}

function matchesHost(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // ".example.com"
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return false;
}
