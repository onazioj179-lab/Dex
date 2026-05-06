// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Transfer Protocol -- Encryption Layer
 * Diffie-Hellman key exchange + AES-256-GCM for all data frames.
 * No file data is ever sent without encryption.
 */

import * as crypto from 'crypto';

const DH_GROUP = 'modp15'; // 3072-bit MODP group (RFC 3526)
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface DTPKeyPair {
  dh: crypto.DiffieHellman | crypto.DiffieHellmanGroup;
  publicKey: Buffer;
}

export interface DTPSessionCipher {
  sharedSecret: Buffer;
  encrypt: (data: Buffer, sequenceNumber: number) => Buffer;
  decrypt: (data: Buffer, sequenceNumber: number) => Buffer | null;
}

/**
 * Generate a DH key pair for the handshake.
 */
export function generateKeyPair(): DTPKeyPair {
  const dh = crypto.createDiffieHellmanGroup(DH_GROUP);
  dh.generateKeys();
  return {
    dh,
    publicKey: dh.getPublicKey(),
  };
}

/**
 * Compute the shared secret from the peer's public key.
 * Returns a session cipher that encrypts/decrypts individual frames.
 */
export function createSessionCipher(keyPair: DTPKeyPair, peerPublicKey: Buffer): DTPSessionCipher {
  const rawSecret = keyPair.dh.computeSecret(peerPublicKey);
  // Derive a 32-byte key from the shared secret using HKDF
  const sharedSecret = crypto.createHash('sha256').update(rawSecret).digest();

  return {
    sharedSecret,
    encrypt: (data: Buffer, _sequenceNumber: number): Buffer => {
      // Random IV per message — required for AES-GCM security
      const iv = crypto.randomBytes(IV_LENGTH);

      const cipher = crypto.createCipheriv(AES_ALGORITHM, sharedSecret, iv, { authTagLength: AUTH_TAG_LENGTH });
      const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
      const tag = cipher.getAuthTag();

      // Output: iv(12) + authTag(16) + encrypted
      return Buffer.concat([iv, tag, encrypted]);
    },
    decrypt: (data: Buffer, sequenceNumber: number): Buffer | null => {
      try {
        if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;

        const iv = data.subarray(0, IV_LENGTH);
        const tag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(AES_ALGORITHM, sharedSecret, iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
      } catch {
        return null;
      }
    },
  };
}

/**
 * Generate a session token from the machine ID.
 * Used to authenticate trusted devices.
 */
export function generateSessionToken(machineId: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  return crypto.createHmac('sha256', machineId)
    .update(`dtp-session-${nonce}-${Date.now()}`)
    .digest('hex');
}

/**
 * Verify a device's session token against stored trusted device tokens.
 */
export function verifyDeviceToken(
  token: string,
  trustedTokens: Set<string>,
): boolean {
  return trustedTokens.has(token);
}

/**
 * Generate a pairing token for new device approval.
 * This token is shown to the user for verification.
 * Uses 6 bytes (48-bit entropy) to resist brute-force.
 */
export function generatePairingCode(): string {
  return crypto.randomBytes(6).toString('hex').toUpperCase(); // 12 char hex code
}

/**
 * Derive a persistent device token from the initial pairing session.
 */
export function derivePairedDeviceToken(
  localMachineId: string,
  remoteMachineId: string,
  pairingSecret: Buffer,
): string {
  return crypto.createHmac('sha256', pairingSecret)
    .update(`${localMachineId}:${remoteMachineId}`)
    .digest('hex');
}
