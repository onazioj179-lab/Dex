// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Apply gamma correction to RGB byte channels. encode() applies
 * pow(x/255, 1/gamma); decode() inverses it.
 */

/** Returns a new Uint8Array with gamma encoding applied (linear -> display). */
export function gammaEncode(input: Uint8Array, gamma = 2.2): Uint8Array {
  const out = new Uint8Array(input.length);
  const inv = 1 / gamma;
  for (let i = 0; i < input.length; i += 1) {
    out[i] = Math.round(255 * Math.pow(input[i]! / 255, inv));
  }
  return out;
}

/** Returns a new Uint8Array with gamma decoding applied (display -> linear). */
export function gammaDecode(input: Uint8Array, gamma = 2.2): Uint8Array {
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    out[i] = Math.round(255 * Math.pow(input[i]! / 255, gamma));
  }
  return out;
}
