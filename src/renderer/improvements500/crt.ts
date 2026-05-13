// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface CrtSolution {
  remainder: bigint;
  modulus: bigint;
}

function gcdExt(a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint } {
  if (b === 0n) return { g: a, x: 1n, y: 0n };
  const r = gcdExt(b, a % b);
  return { g: r.g, x: r.y, y: r.x - (a / b) * r.y };
}

export function crt(remainders: ReadonlyArray<bigint>, moduli: ReadonlyArray<bigint>): CrtSolution | null {
  if (remainders.length !== moduli.length) throw new Error('length mismatch');
  let r = 0n;
  let m = 1n;
  for (let i = 0; i < remainders.length; i++) {
    const ri = ((remainders[i] % moduli[i]) + moduli[i]) % moduli[i];
    const mi = moduli[i];
    const { g, x } = gcdExt(m, mi);
    const diff = ri - r;
    if (diff % g !== 0n) return null;
    const lcm = (m / g) * mi;
    let nr = r + ((m * ((diff / g) * x)) % lcm);
    nr = ((nr % lcm) + lcm) % lcm;
    r = nr;
    m = lcm;
  }
  return { remainder: r, modulus: m };
}
