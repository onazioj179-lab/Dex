// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * TOTP (RFC 6238) two-factor authentication
 * -----------------------------------------------------------------------------
 * Optional TOTP step layered on top of email sign-in. Standard 30-second
 * step, 6-digit codes, SHA-1 (so any authenticator app works: Google
 * Authenticator, Authy, 1Password, Bitwarden, Aegis, ...). Provisioning
 * URI is otpauth://totp/... so the QR code is a one-line render.
 *
 * The HMAC is injected so this module stays pure and test-friendly. The
 * production wiring uses Node's crypto.createHmac in the main process; the
 * fallback uses the browser/Node webcrypto subtle. Either way, the secret
 * never leaves the device that holds it.
 */

// DEX v3.8.8 - TOTP 2FA

import { base32Encode } from './base32';
import { constantTimeEquals } from './abusePrevention';

export const TOTP_PERIOD_SEC = 30;
export const TOTP_DIGITS = 6;

/** Async HMAC-SHA1: takes key + message bytes, returns 20-byte digest. */
export type HmacSha1 = (key: Uint8Array, message: Uint8Array) => Promise<Uint8Array>;

/** Generate a fresh 20-byte secret using injected randomness. */
export function generateTotpSecret(rand: (n: number) => Uint8Array): Uint8Array {
  return rand(20);
}

/** Format a secret as base32 (the form authenticator apps expect). */
export function encodeTotpSecret(secret: Uint8Array): string {
  return base32Encode(secret);
}

/** Build the otpauth:// URI for the QR code. */
export function buildOtpAuthUri(opts: {
  secret: Uint8Array;
  issuer: string;
  accountName: string;
  digits?: number;
  period?: number;
}): string {
  const digits = opts.digits ?? TOTP_DIGITS;
  const period = opts.period ?? TOTP_PERIOD_SEC;
  const secretB32 = base32Encode(opts.secret).replace(/=+$/, '');
  const label = encodeURIComponent(`${opts.issuer}:${opts.accountName}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer: opts.issuer,
    algorithm: 'SHA1',
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Compute the TOTP code for a given counter. */
export async function computeTotpCode(
  secret: Uint8Array,
  counter: number,
  hmac: HmacSha1,
  digits: number = TOTP_DIGITS,
): Promise<string> {
  const buf = new Uint8Array(8);
  // Big-endian 64-bit counter (high 32 bits zero for any reasonable time).
  let c = counter;
  for (let i = 7; i >= 0; i--) { buf[i] = c & 0xff; c = Math.floor(c / 256); }
  const digest = await hmac(secret, buf);
  const offset = digest[digest.length - 1] & 0x0f;
  const bin =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return String(bin % mod).padStart(digits, '0');
}

/** Verify a code allowing +/- `window` steps for clock drift. */
export async function verifyTotpCode(opts: {
  secret: Uint8Array;
  code: string;
  hmac: HmacSha1;
  now?: number;
  window?: number;
  period?: number;
  digits?: number;
}): Promise<boolean> {
  const now = opts.now ?? Date.now();
  const window = opts.window ?? 1;
  const period = opts.period ?? TOTP_PERIOD_SEC;
  const digits = opts.digits ?? TOTP_DIGITS;
  if (typeof opts.code !== 'string' || opts.code.length !== digits) return false;
  const counter = Math.floor(now / 1000 / period);
  for (let w = -window; w <= window; w++) {
    const c = await computeTotpCode(opts.secret, counter + w, opts.hmac, digits);
    if (constantTimeEquals(c, opts.code)) return true;
  }
  return false;
}

/** Generate a set of one-time recovery codes (for losing the authenticator). */
export function generateRecoveryCodes(count: number, rand: (n: number) => Uint8Array): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = rand(5); // 10 hex chars per code
    let s = '';
    for (let j = 0; j < bytes.length; j++) s += bytes[j].toString(16).padStart(2, '0');
    codes.push(`${s.slice(0, 5)}-${s.slice(5, 10)}`);
  }
  return codes;
}
