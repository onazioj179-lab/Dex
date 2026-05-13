// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lexicographic next/previous permutation in-place on a numeric
 * array. Returns true if a successor permutation exists, false if
 * the input was already the last permutation (in which case it is
 * mutated to the first/last permutation appropriately).
 */

export function nextPermutation(arr: number[]): boolean {
  if (arr.length < 2) return false;
  let i = arr.length - 2;
  while (i >= 0 && arr[i]! >= arr[i + 1]!) i -= 1;
  if (i < 0) {
    arr.reverse();
    return false;
  }
  let j = arr.length - 1;
  while (arr[j]! <= arr[i]!) j -= 1;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  // Reverse arr[i+1..end]
  let lo = i + 1;
  let hi = arr.length - 1;
  while (lo < hi) {
    [arr[lo], arr[hi]] = [arr[hi]!, arr[lo]!];
    lo += 1;
    hi -= 1;
  }
  return true;
}

export function prevPermutation(arr: number[]): boolean {
  if (arr.length < 2) return false;
  let i = arr.length - 2;
  while (i >= 0 && arr[i]! <= arr[i + 1]!) i -= 1;
  if (i < 0) {
    arr.reverse();
    return false;
  }
  let j = arr.length - 1;
  while (arr[j]! >= arr[i]!) j -= 1;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  let lo = i + 1;
  let hi = arr.length - 1;
  while (lo < hi) {
    [arr[lo], arr[hi]] = [arr[hi]!, arr[lo]!];
    lo += 1;
    hi -= 1;
  }
  return true;
}
