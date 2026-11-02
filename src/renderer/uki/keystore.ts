// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * API-key store for AI providers.
 *
 * In the desktop app keys live in the native secret store (`secrets:*`,
 * src-tauri/src/secrets_ctl.rs): each key is protected with Windows DPAPI for
 * the current user and kept out of localStorage. Reads stay synchronous for the
 * orchestrator through an in-memory cache filled by `hydrateKeystore()` at
 * startup. Keys saved by older builds (localStorage, reversible XOR) are moved
 * into the secret store once, and the old copy is removed only after the
 * native read-back matches.
 *
 * Without the native store (web preview, non-Windows) the legacy obfuscated
 * localStorage path is used. That is NOT encryption; Settings says so.
 */

const PREFIX = 'dex-uki-key-';
const SALT = 'dex-uki-keystore-v1';
const secretName = (provider: string) => `uki-provider:${provider}`;

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

const cache = new Map<string, string>();
let secureStore: Invoke | null = null;

function nativeInvoke(): Invoke | null {
  const dex = (globalThis as unknown as { dex?: { invoke?: Invoke } }).dex;
  return dex?.invoke ? dex.invoke.bind(dex) : null;
}

/** Reversible XOR with the app salt. */
function xorWithSalt(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    out += String.fromCharCode(input.charCodeAt(i) ^ SALT.charCodeAt(i % SALT.length));
  }
  return out;
}

/** Obfuscate a key for storage (XOR + base64). */
export function obfuscate(key: string): string {
  try { return btoa(xorWithSalt(key)); } catch { return ''; }
}

/** Reverse `obfuscate`. */
export function deobfuscate(stored: string): string {
  try { return xorWithSalt(atob(stored)); } catch { return ''; }
}

function legacyGet(provider: string): string | null {
  try {
    const raw = localStorage.getItem(PREFIX + provider);
    return raw ? deobfuscate(raw) : null;
  } catch {
    return null;
  }
}

function legacyProviders(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
  } catch { /* */ }
  return out;
}

const okResult = (v: unknown) => !!v && typeof v === 'object' && (v as { success?: unknown }).success === true;

/** True once keys are held by the native (DPAPI) store rather than localStorage. */
export function isSecureKeystore(): boolean {
  return secureStore !== null;
}

/**
 * Load keys from the native secret store into memory and migrate any legacy
 * localStorage keys into it. Safe to call more than once; a no-op without the
 * native store.
 */
export async function hydrateKeystore(invoke: Invoke | null = nativeInvoke()): Promise<void> {
  if (!invoke) return;
  try {
    const status = (await invoke('secrets:status')) as { available?: boolean } | null;
    if (!status?.available) return;
    const names = (await invoke('secrets:list')) as unknown;
    for (const name of Array.isArray(names) ? names : []) {
      if (typeof name !== 'string' || !name.startsWith('uki-provider:')) continue;
      const value = await invoke('secrets:get', name);
      if (typeof value === 'string' && value) cache.set(name.slice('uki-provider:'.length), value);
    }
    secureStore = invoke;
    for (const provider of legacyProviders()) {
      const value = legacyGet(provider);
      if (!value) continue;
      if (!cache.has(provider)) {
        if (!okResult(await invoke('secrets:set', secretName(provider), value))) continue;
        if ((await invoke('secrets:get', secretName(provider))) !== value) continue;
        cache.set(provider, value);
      }
      try { localStorage.removeItem(PREFIX + provider); } catch { /* */ }
    }
  } catch {
    /* native store unavailable: legacy path stays in use */
  }
}

export function setApiKey(provider: string, key: string): void {
  if (!key) { removeApiKey(provider); return; }
  const store = secureStore;
  if (store) {
    cache.set(provider, key);
    void Promise.resolve(store('secrets:set', secretName(provider), key)).then((r) => {
      if (okResult(r)) {
        try { localStorage.removeItem(PREFIX + provider); } catch { /* */ }
      } else {
        try { localStorage.setItem(PREFIX + provider, obfuscate(key)); } catch { /* */ } // never lose the key
      }
    }).catch(() => {
      try { localStorage.setItem(PREFIX + provider, obfuscate(key)); } catch { /* */ }
    });
    return;
  }
  try { localStorage.setItem(PREFIX + provider, obfuscate(key)); } catch { /* storage unavailable */ }
}

export function getApiKey(provider: string): string | null {
  // The in-memory cache is only authoritative while the secure store is active;
  // otherwise localStorage is the single source of truth (legacy path).
  return (secureStore ? cache.get(provider) : undefined) ?? legacyGet(provider);
}

export function removeApiKey(provider: string): void {
  cache.delete(provider);
  try { localStorage.removeItem(PREFIX + provider); } catch { /* */ }
  if (secureStore) void Promise.resolve(secureStore('secrets:delete', secretName(provider))).catch(() => {});
}

export function hasApiKey(provider: string): boolean {
  const k = getApiKey(provider);
  return !!k && k.length > 0;
}

/** Provider ids that currently have a stored key. */
export function configuredProviders(): string[] {
  return [...new Set([...(secureStore ? cache.keys() : []), ...legacyProviders()])];
}

/** Test hook: forget in-memory state. */
export function _resetKeystoreForTests(): void {
  cache.clear();
  secureStore = null;
}
