// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CORDIC algorithm for sin/cos in circular rotation mode. Uses
 * 24 iterations for ~1e-7 accuracy. Useful when Math.sin/cos are
 * unavailable (e.g. micro environments) or for deterministic output.
 */

const ITERATIONS = 24;
const ATAN_TABLE = new Float64Array(ITERATIONS);
let CORDIC_GAIN = 1;
(function init(): void {
  let k = 1;
  for (let i = 0; i < ITERATIONS; i += 1) {
    ATAN_TABLE[i] = Math.atan(Math.pow(2, -i));
    k *= 1 / Math.sqrt(1 + Math.pow(2, -2 * i));
  }
  CORDIC_GAIN = k;
})();

/** Returns { cos, sin } of `angle` radians via CORDIC. */
export function cordicSinCos(angle: number): { cos: number; sin: number } {
  // Reduce to [-pi, pi]
  let theta = angle % (2 * Math.PI);
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  // Quadrant fold to [-pi/2, pi/2]
  let flip = false;
  if (theta > Math.PI / 2) {
    theta = Math.PI - theta;
    flip = true;
  } else if (theta < -Math.PI / 2) {
    theta = -Math.PI - theta;
    flip = true;
  }
  let x = CORDIC_GAIN;
  let y = 0;
  let z = theta;
  for (let i = 0; i < ITERATIONS; i += 1) {
    const sigma = z >= 0 ? 1 : -1;
    const xn = x - sigma * y * Math.pow(2, -i);
    const yn = y + sigma * x * Math.pow(2, -i);
    z -= sigma * ATAN_TABLE[i]!;
    x = xn;
    y = yn;
  }
  return { cos: flip ? -x : x, sin: y };
}
