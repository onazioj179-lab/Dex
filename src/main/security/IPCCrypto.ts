// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - IPC Envelope Encryption
// Protects sensitive IPC payloads (passwords, PINs, vault secrets, transcripts)
// with per-session AES-256-GCM so plaintext never sits in IPC message buffers.
//
// Architecture:
//   1. On app launch, main generates a random 256-bit session key.
//   2. Renderer receives the key once via contextBridge (preload).
//   3. Renderer seals sensitive params before invoking IPC.
//   4. Main opens sealed params before processing.
//   5. Session key is destroyed on quit; never persisted to disk.
// ===========================================================================

import * as crypto from 'crypto';
import { ipcMain } from 'electron';
import log from 'electron-log';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96 bits — GCM recommended
const TAG_LENGTH = 16;  // 128 bits

// ---------------------------------------------------------------------------
// Sealed envelope format (all base64-encoded strings for IPC safety)
// ---------------------------------------------------------------------------

export interface SealedEnvelope {
  /** Envelope version (for future migration) */
  v: 1;
  /** base64(iv) */
  iv: string;
  /** base64(authTag) */
  tag: string;
  /** base64(ciphertext) */
  ct: string;
}

// ---------------------------------------------------------------------------
// IPCCrypto singleton
// ---------------------------------------------------------------------------

class IPCCryptoClass {
  private sessionKey: Buffer | null = null;
  // Track which webContents IDs have already received the session key.
  // Each renderer/preload context may fetch it once; subsequent requests
  // from the same window return null to prevent key-fishing after setup.
  private readonly deliveredTo = new Set<number>();

  /**
   * Generate a fresh session key and register the IPC handler that
   * lets preload fetch it once. Called once during app startup
   * (Phase A, before any window is shown).
   */
  init(): void {
    this.sessionKey = crypto.randomBytes(32);

    // Each preload context fetches the key exactly once (per webContentsId).
    // Returning null on subsequent calls prevents a compromised renderer
    // from re-harvesting the key after session setup.
    ipcMain.handle('ipc-crypto:getSessionKey', (event) => {
      if (!this.sessionKey) return null;
      const wcId = event.sender.id;
      if (this.deliveredTo.has(wcId)) return null; // already delivered to this window
      this.deliveredTo.add(wcId);
      return this.sessionKey.toString('base64');
    });

    log.info('[IPCCrypto] Session key generated');
  }

  /**
   * Return the raw session key bytes so preload can expose them
   * to the renderer via contextBridge. The key is a Buffer — the
   * preload should convert it to a Uint8Array for the renderer.
   */
  getSessionKeyForPreload(): Buffer {
    if (!this.sessionKey) {
      throw new Error('[IPCCrypto] Session key not initialized');
    }
    return Buffer.from(this.sessionKey);
  }

  /**
   * Seal a plaintext string into an encrypted envelope.
   * Used by the renderer (via a mirrored JS implementation) before
   * invoking sensitive IPC channels.
   */
  seal(plaintext: string): SealedEnvelope {
    if (!this.sessionKey) {
      throw new Error('[IPCCrypto] Session key not initialized');
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.sessionKey, iv, {
      authTagLength: TAG_LENGTH,
    });
    const ct = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      v: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ct.toString('base64'),
    };
  }

  /**
   * Open a sealed envelope and return the plaintext.
   * Throws on tampered/invalid data (GCM auth check).
   */
  open(envelope: SealedEnvelope): string {
    if (!this.sessionKey) {
      throw new Error('[IPCCrypto] Session key not initialized');
    }
    if (!envelope || envelope.v !== 1 || !envelope.iv || !envelope.tag || !envelope.ct) {
      throw new Error('[IPCCrypto] Invalid envelope format');
    }
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const ct = Buffer.from(envelope.ct, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, this.sessionKey, iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(ct),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  /**
   * Safely open an envelope, returning null on any failure instead of
   * throwing. Logs a warning so failures are visible in diagnostics.
   */
  tryOpen(envelope: unknown): string | null {
    try {
      return this.open(envelope as SealedEnvelope);
    } catch (e) {
      log.warn('[IPCCrypto] Failed to open sealed IPC payload:', e);
      return null;
    }
  }

  /**
   * Wipe the session key from memory. Called during app shutdown.
   */
  destroy(): void {
    if (this.sessionKey) {
      this.sessionKey.fill(0);
      this.sessionKey = null;
    }
    log.info('[IPCCrypto] Session key destroyed');
  }
}

/** Singleton — imported by controllers that handle sensitive IPC channels */
export const IPCCrypto = new IPCCryptoClass();
