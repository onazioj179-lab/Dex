// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Huffman coding. Builds a prefix-free code from byte frequencies and
 * encodes/decodes between Uint8Array and a packed bit stream + table.
 */

interface HuffNode {
  weight: number;
  symbol?: number;
  left?: HuffNode;
  right?: HuffNode;
}

function buildTree(freq: Map<number, number>): HuffNode | null {
  const heap: HuffNode[] = [];
  for (const [sym, w] of freq) heap.push({ symbol: sym, weight: w });
  if (heap.length === 0) return null;
  if (heap.length === 1) {
    // Special case: ensure at least one bit per symbol
    return { weight: heap[0]!.weight, left: heap[0]!, right: { symbol: heap[0]!.symbol, weight: 0 } };
  }
  heap.sort((a, b) => a.weight - b.weight);
  while (heap.length > 1) {
    const a = heap.shift()!;
    const b = heap.shift()!;
    const merged: HuffNode = { weight: a.weight + b.weight, left: a, right: b };
    let lo = 0;
    let hi = heap.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (heap[m]!.weight <= merged.weight) lo = m + 1;
      else hi = m;
    }
    heap.splice(lo, 0, merged);
  }
  return heap[0]!;
}

function buildCodes(node: HuffNode, prefix: string, out: Map<number, string>): void {
  if (node.symbol !== undefined && !node.left && !node.right) {
    out.set(node.symbol, prefix === '' ? '0' : prefix);
    return;
  }
  if (node.left) buildCodes(node.left, prefix + '0', out);
  if (node.right) buildCodes(node.right, prefix + '1', out);
}

export interface HuffmanEncoded {
  bits: Uint8Array;
  bitLength: number;
  table: Map<number, string>;
}

export function huffmanEncode(input: Uint8Array): HuffmanEncoded {
  const freq = new Map<number, number>();
  for (const b of input) freq.set(b, (freq.get(b) ?? 0) + 1);
  const tree = buildTree(freq);
  const table = new Map<number, string>();
  if (tree) buildCodes(tree, '', table);
  let bitLength = 0;
  for (const b of input) bitLength += table.get(b)!.length;
  const bits = new Uint8Array(Math.ceil(bitLength / 8));
  let bitPos = 0;
  for (const b of input) {
    const code = table.get(b)!;
    for (let i = 0; i < code.length; i += 1) {
      if (code[i] === '1') bits[bitPos >> 3] = bits[bitPos >> 3]! | (1 << (7 - (bitPos & 7)));
      bitPos += 1;
    }
  }
  return { bits, bitLength, table };
}

export function huffmanDecode(encoded: HuffmanEncoded): Uint8Array {
  const reverse = new Map<string, number>();
  for (const [sym, code] of encoded.table) reverse.set(code, sym);
  const out: number[] = [];
  let cur = '';
  for (let i = 0; i < encoded.bitLength; i += 1) {
    const bit = (encoded.bits[i >> 3]! >> (7 - (i & 7))) & 1;
    cur += bit ? '1' : '0';
    const sym = reverse.get(cur);
    if (sym !== undefined) {
      out.push(sym);
      cur = '';
    }
  }
  return new Uint8Array(out);
}
