// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * IPv4 and IPv6 parsing/formatting.
 *
 * Returns null for invalid input; never throws on parse so callers can
 * branch cleanly. Strict numeric forms only (no DNS resolution).
 */

export function parseIPv4(input: string): Uint8Array | null {
  if (typeof input !== 'string') return null;
  const parts = input.split('.');
  if (parts.length !== 4) return null;
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    const seg = parts[i] ?? '';
    if (seg.length === 0 || seg.length > 3) return null;
    if (!/^\d+$/.test(seg)) return null;
    if (seg.length > 1 && seg.startsWith('0')) return null;
    const n = Number(seg);
    if (n < 0 || n > 255) return null;
    out[i] = n;
  }
  return out;
}

export function isIPv4(input: string): boolean {
  return parseIPv4(input) !== null;
}

export function formatIPv4(bytes: Uint8Array): string {
  if (bytes.length !== 4) throw new Error('formatIPv4: expected 4 bytes');
  return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
}

export function parseIPv6(input: string): Uint8Array | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  let s = input;
  // Strip optional brackets
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  // Reject zone identifier like %eth0 for now
  if (s.includes('%')) return null;
  // Embedded IPv4 (e.g. ::ffff:192.0.2.1)
  let ipv4Tail: Uint8Array | null = null;
  const lastColon = s.lastIndexOf(':');
  if (lastColon !== -1 && s.slice(lastColon + 1).includes('.')) {
    ipv4Tail = parseIPv4(s.slice(lastColon + 1));
    if (ipv4Tail === null) return null;
    s = s.slice(0, lastColon + 1) + `${(ipv4Tail[0]! << 8 | ipv4Tail[1]!).toString(16)}:${(ipv4Tail[2]! << 8 | ipv4Tail[3]!).toString(16)}`;
  }
  const dcIdx = s.indexOf('::');
  let head: string[];
  let tail: string[];
  if (dcIdx === -1) {
    head = s.split(':');
    tail = [];
  } else {
    if (s.indexOf('::', dcIdx + 1) !== -1) return null;
    head = s.slice(0, dcIdx).split(':').filter((x) => x !== '');
    tail = s.slice(dcIdx + 2).split(':').filter((x) => x !== '');
  }
  if (dcIdx === -1) {
    if (head.length !== 8) return null;
  } else if (head.length + tail.length > 7) {
    return null;
  }
  const groups: string[] = [];
  for (const g of head) groups.push(g);
  const fillCount = 8 - head.length - tail.length;
  for (let i = 0; i < fillCount; i += 1) groups.push('0');
  for (const g of tail) groups.push(g);
  if (groups.length !== 8) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const g = groups[i] ?? '';
    if (g.length === 0 || g.length > 4) return null;
    if (!/^[0-9a-fA-F]+$/.test(g)) return null;
    const v = parseInt(g, 16);
    out[i * 2] = (v >> 8) & 0xff;
    out[i * 2 + 1] = v & 0xff;
  }
  return out;
}

export function isIPv6(input: string): boolean {
  return parseIPv6(input) !== null;
}

export function formatIPv6(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('formatIPv6: expected 16 bytes');
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0));
  }
  // Find longest run of zeros (>=2) for ::
  let bestStart = -1; let bestLen = 0;
  let curStart = -1; let curLen = 0;
  for (let i = 0; i < 8; i += 1) {
    if (groups[i] === 0) {
      if (curStart === -1) { curStart = i; curLen = 1; } else { curLen += 1; }
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else {
      curStart = -1; curLen = 0;
    }
  }
  if (bestLen < 2) {
    return groups.map((g) => g.toString(16)).join(':');
  }
  const headParts = groups.slice(0, bestStart).map((g) => g.toString(16));
  const tailParts = groups.slice(bestStart + bestLen).map((g) => g.toString(16));
  return `${headParts.join(':')}::${tailParts.join(':')}`;
}
