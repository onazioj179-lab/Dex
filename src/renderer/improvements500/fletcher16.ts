// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Fletcher-16 checksum. Lightweight position-sensitive checksum
 * stronger than a simple sum.
 */

export function fletcher16(input: string | Uint8Array): number {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let sum1 = 0;
  let sum2 = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    sum1 = (sum1 + bytes[i]!) % 255;
    sum2 = (sum2 + sum1) % 255;
  }
  return (sum2 << 8) | sum1;
}
