// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Focus Mode controller. Tracks whether the user is in deep-work mode and
 * notifies subscribers so the shell can hide non-pinned dock items, dim
 * widgets, and throttle non-critical notifications.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export type FocusModeReason = 'manual' | 'app-context' | 'idle' | 'schedule';

export interface FocusModeState {
  active: boolean;
  reason: FocusModeReason | null;
  enteredAt: number | null;
}

export type FocusModeListener = (state: FocusModeState) => void;

export class FocusModeController {
  private state: FocusModeState = { active: false, reason: null, enteredAt: null };
  private listeners = new Set<FocusModeListener>();

  getState(): FocusModeState {
    return { ...this.state };
  }

  enter(reason: FocusModeReason, now = Date.now()): void {
    if (this.state.active) return;
    this.state = { active: true, reason, enteredAt: now };
    this.emit();
  }

  exit(): void {
    if (!this.state.active) return;
    this.state = { active: false, reason: null, enteredAt: null };
    this.emit();
  }

  toggle(reason: FocusModeReason = 'manual'): void {
    if (this.state.active) this.exit();
    else this.enter(reason);
  }

  subscribe(listener: FocusModeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) {
      try { l(this.getState()); } catch { /* swallow listener errors */ }
    }
  }
}
