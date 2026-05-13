// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Minimal SemVer 2.0.0 parser and comparator. Supports MAJOR.MINOR.PATCH plus
 * pre-release identifier (alpha.1, rc.2). Build metadata is parsed but does
 * not participate in comparison (per spec).
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: ReadonlyArray<string | number>;
  build: ReadonlyArray<string>;
}

const RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export function parseSemver(input: string): SemVer | null {
  const m = RE.exec(input.trim());
  if (!m) return null;
  const [, ma, mi, pa, pre, build] = m;
  return {
    major: Number(ma),
    minor: Number(mi),
    patch: Number(pa),
    prerelease: pre ? pre.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [],
    build: build ? build.split('.') : [],
  };
}

function comparePrerelease(a: ReadonlyArray<string | number>, b: ReadonlyArray<string | number>): number {
  // No prerelease > prerelease (per spec)
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = typeof x === 'number';
    const yn = typeof y === 'number';
    if (xn && yn) {
      if (x !== y) return (x as number) < (y as number) ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1; // numeric < alphanumeric
    } else {
      const xs = String(x);
      const ys = String(y);
      if (xs !== ys) return xs < ys ? -1 : 1;
    }
  }
  return 0;
}

export function compareSemver(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function compareSemverStrings(a: string, b: string): number {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) throw new Error('invalid semver');
  return compareSemver(av, bv);
}

export function semverSatisfiesGte(version: string, min: string): boolean {
  return compareSemverStrings(version, min) >= 0;
}
