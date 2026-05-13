// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Number Theoretic Transform with prime mod 998244353, primitive root 3.
const MOD = 998244353n;
const G = 3n;

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

export function ntt(a: BigInt64Array, invert: boolean): void {
  const n = a.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const w = invert ? modPow(G, MOD - 1n - (MOD - 1n) / BigInt(len), MOD) : modPow(G, (MOD - 1n) / BigInt(len), MOD);
    for (let i = 0; i < n; i += len) {
      let wn = 1n;
      for (let k = 0; k < len / 2; k++) {
        const u = a[i + k];
        const v = (a[i + k + len / 2] * wn) % MOD;
        a[i + k] = (u + v) % MOD;
        a[i + k + len / 2] = ((u - v) % MOD + MOD) % MOD;
        wn = (wn * w) % MOD;
      }
    }
  }
  if (invert) {
    const nInv = modPow(BigInt(n), MOD - 2n, MOD);
    for (let i = 0; i < n; i++) a[i] = (a[i] * nInv) % MOD;
  }
}

export function nttMultiply(a: ReadonlyArray<bigint>, b: ReadonlyArray<bigint>): bigint[] {
  let n = 1;
  while (n < a.length + b.length) n <<= 1;
  const fa = new BigInt64Array(n);
  const fb = new BigInt64Array(n);
  for (let i = 0; i < a.length; i++) fa[i] = ((a[i] % MOD) + MOD) % MOD;
  for (let i = 0; i < b.length; i++) fb[i] = ((b[i] % MOD) + MOD) % MOD;
  ntt(fa, false);
  ntt(fb, false);
  for (let i = 0; i < n; i++) fa[i] = (fa[i] * fb[i]) % MOD;
  ntt(fa, true);
  const out: bigint[] = new Array(a.length + b.length - 1);
  for (let i = 0; i < out.length; i++) out[i] = fa[i];
  return out;
}
