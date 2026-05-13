/**
 * Phase 15 — Lock Screen Auth
 * ----------------------------------------------------------------------------
 * A lightweight, dependency-free passcode/password verifier with retry
 * backoff suitable for the lock screen. We deliberately avoid `crypto.subtle`
 * here so the module works in unit tests, workers, and renderers without a
 * Web Crypto polyfill. The hash function is FNV-1a 32-bit + a simple per-byte
 * mixer; this is NOT for protecting secrets at rest. Real persistence should
 * encrypt with the OS keystore — this module only verifies what the keystore
 * returns.
 */

export interface PasscodeRecord {
    /** Hex-encoded hash. */
    hash: string;
    /** Random salt (hex) used for hashing. */
    salt: string;
    /** Algorithm tag for forward-compat. */
    algo: 'fnv1a-mix-v1';
}

export interface AttemptState {
    /** Number of consecutive failed attempts. */
    failures: number;
    /** Earliest ms-since-epoch the next attempt is permitted. */
    lockedUntil: number;
}

const INITIAL_STATE: AttemptState = Object.freeze({ failures: 0, lockedUntil: 0 }) as AttemptState;

export function initialAttemptState(): AttemptState {
    return { ...INITIAL_STATE };
}

/** FNV-1a 32-bit on a UTF-8 byte stream, returned as 8-char lowercase hex. */
export function fnv1aHex(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i) & 0xff;
        // FNV prime; force unsigned 32-bit.
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/** Hash a passcode with a salt; concatenates hash + reversed-salt mixer. */
export function hashPasscode(passcode: string, salt: string): string {
    const a = fnv1aHex(`${salt}|${passcode}`);
    const b = fnv1aHex(`${passcode}|${reverse(salt)}`);
    return `${a}${b}`;
}

function reverse(s: string): string {
    let out = '';
    for (let i = s.length - 1; i >= 0; i--) out += s[i];
    return out;
}

/** Build a record from a fresh passcode. Salt should come from a CSPRNG. */
export function createPasscodeRecord(passcode: string, salt: string): PasscodeRecord {
    if (passcode.length === 0) {
        throw new Error('Passcode must not be empty');
    }
    if (salt.length < 8) {
        throw new Error('Salt must be at least 8 characters');
    }
    return {
        hash: hashPasscode(passcode, salt),
        salt,
        algo: 'fnv1a-mix-v1',
    };
}

/**
 * Constant-time string comparison so attempt timings don't leak info about
 * partial matches. Both inputs must be hex strings of equal length.
 */
export function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

export interface VerifyResult {
    ok: boolean;
    /** Updated attempt state to persist back. */
    state: AttemptState;
    /** When `ok=false`, ms the caller must wait before the next attempt. */
    retryAfterMs: number;
}

type BackoffFn = (failures: number) => number;

export interface VerifyOpts {
    /** Now-clock injection for tests. */
    now?: number;
    /**
     * Backoff schedule (ms) keyed by failure count. Defaults to a humane curve:
     *  1: 0, 2: 0, 3: 1s, 4: 5s, 5: 15s, 6: 30s, 7+: 60s.
     */
    backoffMs?: BackoffFn;
}

const DEFAULT_BACKOFF: BackoffFn = (f) => {
    if (f <= 2) return 0;
    if (f === 3) return 1_000;
    if (f === 4) return 5_000;
    if (f === 5) return 15_000;
    if (f === 6) return 30_000;
    return 60_000;
};

/**
 * Verify a passcode attempt. Pure: callers feed in the prior state and store
 * the returned state. When the lock window is active, the input is rejected
 * without consuming a new failure.
 */
export function verifyPasscode(record: PasscodeRecord, attempt: string, prior: AttemptState, opts: VerifyOpts = {}): VerifyResult {
    const now = opts.now ?? Date.now();
    const backoff: BackoffFn = opts.backoffMs ?? DEFAULT_BACKOFF;

    if (now < prior.lockedUntil) {
        return {
            ok: false,
            state: prior,
            retryAfterMs: prior.lockedUntil - now,
        };
    }

    const expected = hashPasscode(attempt, record.salt);
    const ok = constantTimeEqual(expected, record.hash);
    if (ok) {
        return { ok: true, state: initialAttemptState(), retryAfterMs: 0 };
    }
    const failures = prior.failures + 1;
    const wait = backoff(failures);
    const lockedUntil = wait > 0 ? now + wait : 0;
    return {
        ok: false,
        state: { failures, lockedUntil },
        retryAfterMs: wait,
    };
}
