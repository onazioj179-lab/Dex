// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Typewriter animator. Given a target string and a per-character delay,
 * emits progressively longer prefixes via a callback. Pure timing / state
 * logic; the host owns the actual rendering.
 */

export interface TypewriterOptions {
  msPerChar?: number;
  /** Optional callback when animation finishes. */
  onDone?: () => void;
}

export class Typewriter {
  private target = '';
  private index = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly emit: (current: string) => void;
  private readonly msPerChar: number;
  private readonly onDone?: () => void;

  constructor(emit: (current: string) => void, opts: TypewriterOptions = {}) {
    this.emit = emit;
    this.msPerChar = Math.max(1, opts.msPerChar ?? 30);
    this.onDone = opts.onDone;
  }

  start(text: string): void {
    this.stop();
    this.target = text;
    this.index = 0;
    this.emit('');
    this.tick();
  }

  /** Append more text to the in-progress animation. */
  append(more: string): void {
    this.target += more;
    if (this.timer === null && this.index < this.target.length) this.tick();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Skip to the end immediately. */
  finish(): void {
    this.stop();
    this.index = this.target.length;
    this.emit(this.target);
    this.onDone?.();
  }

  private tick(): void {
    if (this.index >= this.target.length) {
      this.timer = null;
      this.onDone?.();
      return;
    }
    this.index += 1;
    this.emit(this.target.slice(0, this.index));
    this.timer = setTimeout(() => this.tick(), this.msPerChar);
  }
}
