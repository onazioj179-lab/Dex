// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * API-key store for AI providers. Keys are kept out of plain text in
 * localStorage via a reversible obfuscation. NOTE: this is **not** strong
 * cryptography — in the packaged app the OS keychain / `dex-core` `crypto.rs`
 * secure store replaces it; this keeps keys non-plaintext during dev and gives
 * the orchestrator a single, testable key API.
 */

const PREFIX = 'dex-uki-key-';
const SALT = 'dex-uki-keystore-v1';

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

export function setApiKey(provider: string, key: string): void {
  try {
    if (!key) { removeApiKey(provider); return; }
    localStorage.setItem(PREFIX + provider, obfuscate(key));
  } catch { /* storage unavailable */ }
}

export function getApiKey(provider: string): string | null {
  try {
    const raw = localStorage.getItem(PREFIX + provider);
    return raw ? deobfuscate(raw) : null;
  } catch {
    return null;
  }
}

export function removeApiKey(provider: string): void {
  try { localStorage.removeItem(PREFIX + provider); } catch { /* */ }
}

export function hasApiKey(provider: string): boolean {
  const k = getApiKey(provider);
  return !!k && k.length > 0;
}

/** Provider ids that currently have a stored key. */
export function configuredProviders(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
  } catch { /* */ }
  return out;
}
