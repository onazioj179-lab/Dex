// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Jaro and Jaro-Winkler string similarity scores. Both return values
 * in [0, 1] with 1 meaning identical strings.
 */

export function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;
  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Uint8Array(len1);
  const s2Matches = new Uint8Array(len2);
  let matches = 0;
  for (let i = 0; i < len1; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j += 1) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = 1;
      s2Matches[j] = 1;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i += 1) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k += 1;
    if (s1[i] !== s2[k]) transpositions += 1;
    k += 1;
  }
  transpositions = Math.floor(transpositions / 2);
  return (
    (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3
  );
}

export function jaroWinklerSimilarity(s1: string, s2: string, prefixScale = 0.1): number {
  const jaro = jaroSimilarity(s1, s2);
  if (jaro === 0) return 0;
  let prefix = 0;
  const limit = Math.min(4, s1.length, s2.length);
  for (let i = 0; i < limit; i += 1) {
    if (s1[i] === s2[i]) prefix += 1;
    else break;
  }
  return jaro + prefix * prefixScale * (1 - jaro);
}
