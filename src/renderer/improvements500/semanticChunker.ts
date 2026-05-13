// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Semantic text chunker for embedding pipelines. Splits text into
 * approximately fixed-size chunks with configurable overlap, preferring
 * sentence boundaries.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface ChunkOptions {
  targetSize?: number;
  overlap?: number;
  minSize?: number;
}

export interface SemanticChunk {
  text: string;
  start: number;
  end: number;
  index: number;
}

const SENTENCE_END = /[.!?]\s+/g;

export function semanticChunker(input: string, options: ChunkOptions = {}): SemanticChunk[] {
  const target = Math.max(32, options.targetSize ?? 512);
  const overlap = Math.max(0, Math.min(target - 1, options.overlap ?? 64));
  const minSize = Math.max(16, options.minSize ?? Math.floor(target / 4));
  if (input.length === 0) return [];
  if (input.length <= target) {
    return [{ text: input, start: 0, end: input.length, index: 0 }];
  }
  const chunks: SemanticChunk[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < input.length) {
    const ideal = Math.min(input.length, cursor + target);
    let end = ideal;
    if (ideal < input.length) {
      const slice = input.slice(cursor, ideal);
      SENTENCE_END.lastIndex = 0;
      let lastBoundary = -1;
      let m: RegExpExecArray | null;
      while ((m = SENTENCE_END.exec(slice)) !== null) {
        lastBoundary = m.index + m[0].length;
      }
      if (lastBoundary >= minSize) end = cursor + lastBoundary;
    }
    const text = input.slice(cursor, end);
    chunks.push({ text, start: cursor, end, index });
    index++;
    if (end >= input.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
  }
  return chunks;
}
