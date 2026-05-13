// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
interface SamState {
  next: Map<number, number>;
  link: number;
  len: number;
}

export class SuffixAutomaton {
  private readonly states: SamState[] = [];
  private last = 0;

  constructor(s?: string) {
    this.states.push({ next: new Map(), link: -1, len: 0 });
    if (s) {
      for (let i = 0; i < s.length; i++) this.extend(s.charCodeAt(i));
    }
  }

  extend(c: number): void {
    const cur = this.states.length;
    this.states.push({ next: new Map(), link: -1, len: this.states[this.last].len + 1 });
    let p = this.last;
    while (p !== -1 && !this.states[p].next.has(c)) {
      this.states[p].next.set(c, cur);
      p = this.states[p].link;
    }
    if (p === -1) {
      this.states[cur].link = 0;
    } else {
      const q = this.states[p].next.get(c)!;
      if (this.states[p].len + 1 === this.states[q].len) {
        this.states[cur].link = q;
      } else {
        const clone = this.states.length;
        this.states.push({
          next: new Map(this.states[q].next),
          link: this.states[q].link,
          len: this.states[p].len + 1,
        });
        while (p !== -1 && this.states[p].next.get(c) === q) {
          this.states[p].next.set(c, clone);
          p = this.states[p].link;
        }
        this.states[q].link = clone;
        this.states[cur].link = clone;
      }
    }
    this.last = cur;
  }

  contains(pattern: string): boolean {
    let v = 0;
    for (let i = 0; i < pattern.length; i++) {
      const nx = this.states[v].next.get(pattern.charCodeAt(i));
      if (nx === undefined) return false;
      v = nx;
    }
    return true;
  }

  countDistinctSubstrings(): number {
    let total = 0;
    for (let i = 1; i < this.states.length; i++) {
      total += this.states[i].len - this.states[this.states[i].link].len;
    }
    return total;
  }
}
