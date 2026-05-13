/**
 * Phase 15 — Splash / Loading Transition Sequencer
 * ----------------------------------------------------------------------------
 * Coordinates the boot sequence so the shell never shows a flash of empty
 * Home and never lingers on a splash longer than necessary. Pure state
 * machine — the renderer maps states to actual visuals.
 */

export type SplashState =
    | 'idle'
    | 'splash'           // boot brand visible
    | 'restoring'        // hydrating workspace
    | 'home-ready'       // Home is rendered; splash may dissolve
    | 'done';

export interface SplashTimings {
    /** Minimum time we must show the splash to avoid jarring flashes. */
    minSplashMs: number;
    /** Hard upper bound; if hydration stalls, force-advance after this. */
    maxSplashMs: number;
    /** Crossfade duration once we transition into Home. */
    fadeMs: number;
}

export const DEFAULT_TIMINGS: Readonly<SplashTimings> = Object.freeze({
    minSplashMs: 600,
    maxSplashMs: 4_000,
    fadeMs: 240,
});

export interface SplashEventLog {
    splashStartedAt: number;
    homeReadyAt: number | null;
    restoringStartedAt: number | null;
    doneAt: number | null;
}

export interface SplashSnapshot {
    state: SplashState;
    log: SplashEventLog;
}

export class SplashSequencer {
    private state: SplashState = 'idle';
    private timings: SplashTimings;
    private log: SplashEventLog = {
        splashStartedAt: 0,
        homeReadyAt: null,
        restoringStartedAt: null,
        doneAt: null,
    };

    constructor(timings?: Partial<SplashTimings>) {
        this.timings = {
            minSplashMs: Math.max(0, timings?.minSplashMs ?? DEFAULT_TIMINGS.minSplashMs),
            maxSplashMs: Math.max(0, timings?.maxSplashMs ?? DEFAULT_TIMINGS.maxSplashMs),
            fadeMs: Math.max(0, timings?.fadeMs ?? DEFAULT_TIMINGS.fadeMs),
        };
    }

    snapshot(): SplashSnapshot {
        return { state: this.state, log: { ...this.log } };
    }

    /** Begin the boot sequence. */
    start(now: number = Date.now()): SplashState {
        this.state = 'splash';
        this.log.splashStartedAt = now;
        return this.state;
    }

    markRestoring(now: number = Date.now()): void {
        if (this.state === 'idle') this.start(now);
        this.log.restoringStartedAt = now;
    }

    /**
     * Signal Home is mounted and ready to receive focus. Returns the next
     * state, which may still be `splash` if the minimum splash duration has
     * not elapsed (the renderer should poll `tick` until `done`).
     */
    markHomeReady(now: number = Date.now()): SplashState {
        this.log.homeReadyAt = now;
        return this.tick(now);
    }

    /**
     * Drive the state machine forward based on elapsed time. Returns the
     * current state. Idempotent.
     */
    tick(now: number = Date.now()): SplashState {
        if (this.state === 'idle' || this.state === 'done') return this.state;

        const stateAtTickStart = this.state;
        const elapsed = now - this.log.splashStartedAt;

        // Force-advance if we have lingered past the hard cap regardless of readiness.
        if (elapsed >= this.timings.maxSplashMs) {
            this.state = 'home-ready';
        }

        if (this.state === 'splash') {
            if (this.log.restoringStartedAt !== null && this.log.homeReadyAt === null) {
                this.state = 'restoring';
            } else if (this.log.homeReadyAt !== null && elapsed >= this.timings.minSplashMs) {
                this.state = 'home-ready';
            }
        } else if (this.state === 'restoring') {
            if (this.log.homeReadyAt !== null && elapsed >= this.timings.minSplashMs) {
                this.state = 'home-ready';
            }
        }

        // Only dissolve into `done` if we were already home-ready at the start
        // of this tick. This guarantees at least one stable home-ready frame.
        if (this.state === 'home-ready' && stateAtTickStart === 'home-ready') {
            const sinceReady = now - (this.log.homeReadyAt ?? now);
            if (sinceReady >= this.timings.fadeMs) {
                this.state = 'done';
                this.log.doneAt = now;
            }
        }

        return this.state;
    }

    /** Convenience: returns `[0,1]` opacity for the splash overlay. */
    splashOpacity(now: number = Date.now()): number {
        const s = this.tick(now);
        if (s === 'splash' || s === 'restoring') return 1;
        if (s === 'done') return 0;
        // home-ready: fade out across `fadeMs`.
        const ready = this.log.homeReadyAt ?? now;
        const t = (now - ready) / Math.max(1, this.timings.fadeMs);
        return Math.max(0, Math.min(1, 1 - t));
    }
}
