// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Decode a JWT's header and payload WITHOUT signature verification.
 *
 * IMPORTANT: This is a parser, not a validator. NEVER trust claims returned
 * here for authorization. Use only for inspection/debugging or when the
 * signature has already been verified by a trusted upstream.
 */

export interface DecodedJwt<H = Record<string, unknown>, P = Record<string, unknown>> {
  header: H;
  payload: P;
  signature: string;
}

export function jwtDecodeNoVerify<H = Record<string, unknown>, P = Record<string, unknown>>(
  token: string,
): DecodedJwt<H, P> {
  if (typeof token !== 'string') throw new Error('jwtDecodeNoVerify: token must be a string');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('jwtDecodeNoVerify: token must have 3 parts');
  const headerB64 = parts[0] ?? '';
  const payloadB64 = parts[1] ?? '';
  const signature = parts[2] ?? '';
  let header: H;
  let payload: P;
  try {
    header = JSON.parse(decodeBase64Url(headerB64)) as H;
  } catch {
    throw new Error('jwtDecodeNoVerify: invalid header JSON');
  }
  try {
    payload = JSON.parse(decodeBase64Url(payloadB64)) as P;
  } catch {
    throw new Error('jwtDecodeNoVerify: invalid payload JSON');
  }
  return { header, payload, signature };
}

function decodeBase64Url(s: string): string {
  let normalized = s.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) normalized += '=';
  if (typeof atob === 'function') {
    const bin = atob(normalized);
    // Convert latin1 binary string to UTF-8
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  // Node fallback
  const g = globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } };
  if (g.Buffer) return g.Buffer.from(normalized, 'base64').toString('utf8');
  throw new Error('jwtDecodeNoVerify: no base64 decoder available');
}
