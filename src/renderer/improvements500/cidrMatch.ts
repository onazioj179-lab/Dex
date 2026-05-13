// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * IPv4/IPv6 CIDR membership testing.
 */

import { parseIPv4, parseIPv6 } from './ipParse';

export function cidrMatch(cidr: string, address: string): boolean {
  const slash = cidr.indexOf('/');
  if (slash === -1) return false;
  const network = cidr.slice(0, slash);
  const prefix = Number(cidr.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0) return false;
  const isV4 = network.includes('.');
  if (isV4) {
    if (prefix > 32) return false;
    const a = parseIPv4(network);
    const b = parseIPv4(address);
    if (a === null || b === null) return false;
    return matchBits(a, b, prefix);
  }
  if (prefix > 128) return false;
  const a = parseIPv6(network);
  const b = parseIPv6(address);
  if (a === null || b === null) return false;
  return matchBits(a, b, prefix);
}

function matchBits(a: Uint8Array, b: Uint8Array, prefixBits: number): boolean {
  let bitsLeft = prefixBits;
  for (let i = 0; i < a.length && bitsLeft > 0; i += 1) {
    if (bitsLeft >= 8) {
      if (a[i] !== b[i]) return false;
      bitsLeft -= 8;
    } else {
      const mask = 0xff << (8 - bitsLeft) & 0xff;
      if (((a[i] ?? 0) & mask) !== ((b[i] ?? 0) & mask)) return false;
      bitsLeft = 0;
    }
  }
  return true;
}
