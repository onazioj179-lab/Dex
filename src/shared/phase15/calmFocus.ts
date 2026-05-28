// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 15 — Calm Focus Engine
 * ----------------------------------------------------------------------------
 * Suppresses non-essential interruptions during long focused sessions. Tracks
 * recent activity windows and decides whether a notification, hover effect,
 * or motion flourish should be allowed through.
 */

export type InterruptionKind = 'notification' | 'hoverGlow' | 'celebration' | 'tip' | 'badge';

export interface CalmConfig {
    /** Length of the activity window we observe, in ms. */
    windowMs: number;
    /** Active-input threshold (count of input events) to consider "in flow". */
    flowThreshold: number;
    /** Allowlist applied even when in flow (e.g. critical security toasts). */
    alwaysAllow: ReadonlyArray<InterruptionKind>;
}

export const DEFAULT_CALM: Readonly<CalmConfig> = Object.freeze({
    windowMs: 60_000,
    flowThreshold: 30,
    alwaysAllow: Object.freeze(['notification']) as unknown as ReadonlyArray<InterruptionKind>,
});

export interface CalmDecision {
    allow: boolean;
    /** Why the engine decided this way; useful for debug overlays. */
    reason: 'always-allow' | 'no-flow' | 'flow-suppressed' | 'manual-do-not-disturb';
}

export class CalmFocusEngine {
    private config: CalmConfig;
    private events: number[] = [];
    private dndUntil = 0;

    constructor(config?: Partial<CalmConfig>) {
        this.config = {
            windowMs: config?.windowMs ?? DEFAULT_CALM.windowMs,
            flowThreshold: config?.flowThreshold ?? DEFAULT_CALM.flowThreshold,
            alwaysAllow: config?.alwaysAllow ?? DEFAULT_CALM.alwaysAllow,
        };
    }

    /** Record an input event (key press, click, scroll). */
    recordActivity(now: number = Date.now()): void {
        this.events.push(now);
        const cutoff = now - this.config.windowMs;
        // Drop stale events from the head; cheaper than `filter` for hot paths.
        let drop = 0;
        while (drop < this.events.length && this.events[drop] < cutoff) drop++;
        if (drop > 0) this.events.splice(0, drop);
    }

    /** Manually engage Do Not Disturb until `until` (ms epoch). */
    setDoNotDisturb(until: number): void {
        this.dndUntil = until;
    }

    /** Compute current activity rate (events per minute). */
    activityRate(now: number = Date.now()): number {
        const cutoff = now - this.config.windowMs;
        let count = 0;
        for (let i = this.events.length - 1; i >= 0; i--) {
            if (this.events[i] >= cutoff) count++;
            else break;
        }
        return (count / this.config.windowMs) * 60_000;
    }

    inFlow(now: number = Date.now()): boolean {
        return this.activityRate(now) >= this.config.flowThreshold;
    }

    decide(kind: InterruptionKind, now: number = Date.now()): CalmDecision {
        if (now < this.dndUntil) {
            if (this.config.alwaysAllow.includes(kind)) {
                return { allow: true, reason: 'always-allow' };
            }
            return { allow: false, reason: 'manual-do-not-disturb' };
        }
        if (!this.inFlow(now)) {
            return { allow: true, reason: 'no-flow' };
        }
        if (this.config.alwaysAllow.includes(kind)) {
            return { allow: true, reason: 'always-allow' };
        }
        return { allow: false, reason: 'flow-suppressed' };
    }
}
