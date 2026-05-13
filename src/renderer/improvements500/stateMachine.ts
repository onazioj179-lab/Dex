// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tiny finite state machine. Useful for window-state, IPC handshakes,
 * brush-tool gestures, anything with a small set of named states +
 * explicit transitions.
 */

export interface FsmDefinition<S extends string, E extends string> {
  initial: S;
  transitions: { [from in S]?: { [event in E]?: S } };
  /** Optional onEnter callbacks per state. */
  onEnter?: { [state in S]?: (prev: S) => void };
}

export class StateMachine<S extends string, E extends string> {
  private current: S;
  constructor(private readonly def: FsmDefinition<S, E>) { this.current = def.initial; }

  state(): S { return this.current; }

  can(event: E): boolean {
    return Boolean(this.def.transitions[this.current]?.[event]);
  }

  /** Returns true if a transition occurred. */
  send(event: E): boolean {
    const next = this.def.transitions[this.current]?.[event];
    if (!next) return false;
    const prev = this.current;
    this.current = next;
    this.def.onEnter?.[next]?.(prev);
    return true;
  }

  reset(): void { this.current = this.def.initial; }
}
