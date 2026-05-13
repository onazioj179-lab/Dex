// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Karatsuba multiplication for non-negative big integers represented as
 * little-endian base-2^15 digit arrays. Returns the product in the same
 * representation. Falls back to schoolbook below the cutoff.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
const BASE_BITS = 15;
const BASE = 1 << BASE_BITS;
const MASK = BASE - 1;
const CUTOFF = 32;

function trim(a: number[]): number[] {
  while (a.length > 1 && a[a.length - 1] === 0) a.pop();
  return a;
}

function add(a: number[], b: number[]): number[] {
  const out: number[] = new Array(Math.max(a.length, b.length) + 1).fill(0);
  let carry = 0;
  for (let i = 0; i < out.length; i++) {
    const sum = (a[i] ?? 0) + (b[i] ?? 0) + carry;
    out[i] = sum & MASK;
    carry = sum >>> BASE_BITS;
  }
  return trim(out);
}

function sub(a: number[], b: number[]): number[] {
  const out: number[] = new Array(a.length).fill(0);
  let borrow = 0;
  for (let i = 0; i < a.length; i++) {
    let d = a[i]! - (b[i] ?? 0) - borrow;
    if (d < 0) {
      d += BASE;
      borrow = 1;
    } else borrow = 0;
    out[i] = d;
  }
  return trim(out);
}

function shiftLeft(a: number[], k: number): number[] {
  if (k === 0) return a.slice();
  const out: number[] = new Array(a.length + k).fill(0);
  for (let i = 0; i < a.length; i++) out[i + k] = a[i]!;
  return out;
}

function schoolbook(a: number[], b: number[]): number[] {
  const out: number[] = new Array(a.length + b.length).fill(0);
  for (let i = 0; i < a.length; i++) {
    let carry = 0;
    for (let j = 0; j < b.length; j++) {
      const v = out[i + j]! + a[i]! * b[j]! + carry;
      out[i + j] = v & MASK;
      carry = Math.floor(v / BASE);
    }
    out[i + b.length] = (out[i + b.length] ?? 0) + carry;
  }
  return trim(out);
}

export function karatsubaMul(a: readonly number[], b: readonly number[]): number[] {
  const A = a.slice();
  const B = b.slice();
  if (A.length < CUTOFF || B.length < CUTOFF) return schoolbook(A, B);
  const m = Math.floor(Math.max(A.length, B.length) / 2);
  const lowA = trim(A.slice(0, m));
  const highA = trim(A.slice(m));
  const lowB = trim(B.slice(0, m));
  const highB = trim(B.slice(m));
  const z0 = karatsubaMul(lowA, lowB);
  const z2 = karatsubaMul(highA, highB);
  const z1raw = karatsubaMul(add(lowA, highA), add(lowB, highB));
  const z1 = sub(sub(z1raw, z2), z0);
  return trim(add(add(z0, shiftLeft(z1, m)), shiftLeft(z2, 2 * m)));
}

export function digitsToBigInt(digits: readonly number[]): bigint {
  let v = 0n;
  for (let i = digits.length - 1; i >= 0; i--) v = (v << BigInt(BASE_BITS)) | BigInt(digits[i]!);
  return v;
}

export function bigIntToDigits(n: bigint): number[] {
  if (n < 0n) throw new RangeError('bigIntToDigits: negative not supported');
  if (n === 0n) return [0];
  const out: number[] = [];
  let x = n;
  while (x > 0n) {
    out.push(Number(x & BigInt(MASK)));
    x >>= BigInt(BASE_BITS);
  }
  return out;
}
