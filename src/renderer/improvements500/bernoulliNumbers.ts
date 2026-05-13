// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bernoulli numbers B_0..B_n (using the convention B_1 = +1/2 from
 * the Akiyama-Tanigawa algorithm). Computed in O(n^2). Returns exact
 * rationals as numerator/denominator pairs to avoid drift.
 */

export interface Rational {
  num: bigint;
  den: bigint;
}

function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x === 0n ? 1n : x;
}

function reduce(r: Rational): Rational {
  if (r.den < 0n) {
    r = { num: -r.num, den: -r.den };
  }
  const g = gcdBig(r.num, r.den);
  return { num: r.num / g, den: r.den / g };
}

function rAdd(a: Rational, b: Rational): Rational {
  return reduce({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
}
function rSub(a: Rational, b: Rational): Rational {
  return reduce({ num: a.num * b.den - b.num * a.den, den: a.den * b.den });
}
function rMul(a: Rational, b: Rational): Rational {
  return reduce({ num: a.num * b.num, den: a.den * b.den });
}

export function bernoulliNumbers(n: number): Rational[] {
  if (!Number.isInteger(n) || n < 0) throw new Error('bernoulliNumbers: n must be non-negative integer');
  const A: Rational[] = new Array(n + 1);
  const B: Rational[] = new Array(n + 1);
  for (let m = 0; m <= n; m += 1) {
    A[m] = { num: 1n, den: BigInt(m + 1) };
    for (let j = m; j >= 1; j -= 1) {
      A[j - 1] = rMul(rSub(A[j - 1]!, A[j]!), { num: BigInt(j), den: 1n });
    }
    B[m] = A[0]!;
  }
  return B;
}
