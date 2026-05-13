// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Streaming token splitter for SSE / RAG style chunked text. Accepts arbitrary
 * fragments and yields complete tokens delimited by a regex (default: whitespace
 * runs). Buffers any incomplete tail until flushed.
 */

export interface TokenStreamOptions {
  /** Regex (must be global) marking delimiter between tokens. */
  delimiter?: RegExp;
  /** If true, include empty tokens (default: false). */
  keepEmpty?: boolean;
}

export class TokenStream {
  private buffer = '';
  private readonly delim: RegExp;
  private readonly keepEmpty: boolean;

  constructor(opts: TokenStreamOptions = {}) {
    const d = opts.delimiter ?? /\s+/g;
    if (!d.global) {
      throw new Error('delimiter regex must be global');
    }
    this.delim = d;
    this.keepEmpty = opts.keepEmpty === true;
  }

  push(chunk: string): string[] {
    this.buffer += chunk;
    const tokens: string[] = [];
    let lastEnd = 0;
    this.delim.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = this.delim.exec(this.buffer)) !== null) {
      const tok = this.buffer.slice(lastEnd, match.index);
      if (this.keepEmpty || tok.length > 0) tokens.push(tok);
      lastEnd = match.index + match[0].length;
      if (match[0].length === 0) this.delim.lastIndex += 1;
    }
    this.buffer = this.buffer.slice(lastEnd);
    return tokens;
  }

  flush(): string[] {
    if (this.buffer.length === 0) return [];
    const tail = this.buffer;
    this.buffer = '';
    return this.keepEmpty || tail.length > 0 ? [tail] : [];
  }

  get pending(): string {
    return this.buffer;
  }
}
