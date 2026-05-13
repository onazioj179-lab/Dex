// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}

export function babyStepGiantStep(g: bigint, h: bigint, p: bigint): bigint | null {
  // solve g^x ≡ h (mod p)
  let m = 1n;
  while (m * m < p) m++;
  const table = new Map<string, bigint>();
  let cur = 1n;
  for (let j = 0n; j < m; j++) {
    if (!table.has(cur.toString())) table.set(cur.toString(), j);
    cur = (cur * g) % p;
  }
  const factor = modPow(modPow(g, m, p), p - 2n, p);
  let gamma = h % p;
  for (let i = 0n; i <= m; i++) {
    const found = table.get(gamma.toString());
    if (found !== undefined) {
      const x = i * m + found;
      if (modPow(g, x, p) === ((h % p) + p) % p) return x;
    }
    gamma = (gamma * factor) % p;
  }
  return null;
}
