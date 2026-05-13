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

export function tonelliShanks(n: bigint, p: bigint): bigint | null {
  n = ((n % p) + p) % p;
  if (n === 0n) return 0n;
  if (p === 2n) return n;
  if (modPow(n, (p - 1n) / 2n, p) !== 1n) return null;
  if (p % 4n === 3n) return modPow(n, (p + 1n) / 4n, p);
  let q = p - 1n;
  let s = 0n;
  while ((q & 1n) === 0n) {
    q >>= 1n;
    s++;
  }
  let z = 2n;
  while (modPow(z, (p - 1n) / 2n, p) !== p - 1n) z++;
  let m = s;
  let c = modPow(z, q, p);
  let t = modPow(n, q, p);
  let r = modPow(n, (q + 1n) / 2n, p);
  while (true) {
    if (t === 1n) return r;
    let i = 0n;
    let temp = t;
    while (temp !== 1n) {
      temp = (temp * temp) % p;
      i++;
      if (i === m) return null;
    }
    const b = modPow(c, 1n << (m - i - 1n), p);
    m = i;
    c = (b * b) % p;
    t = (t * c) % p;
    r = (r * b) % p;
  }
}
