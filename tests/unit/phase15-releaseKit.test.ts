import { describe, it, expect } from 'vitest';
import {
    DEFAULT_APPEARANCE,
    DEFAULT_AUDIT_CONFIG,
    DEFAULT_CALM,
    DEFAULT_TIMINGS,
    CalmFocusEngine,
    HomeLayoutStore,
    ShellAppearanceBus,
    SplashSequencer,
    WorkspaceSnapshotStore,
    appearanceToCssVars,
    auditSources,
    constantTimeEqual,
    createPasscodeRecord,
    diffSnapshots,
    fnv1aHex,
    initialAttemptState,
    normalizeAppearance,
    normalizeWidget,
    planToolbarOverflow,
    resolveTheme,
    shouldDisableCanvasGlass,
    verifyPasscode,
} from '../../src/shared/phase15';

// ---------------------------------------------------------------------------
// shellAppearanceBus
// ---------------------------------------------------------------------------

describe('shellAppearanceBus', () => {
    it('normalizes garbage input to defaults', () => {
        const p = normalizeAppearance({ theme: 'banana' as any, density: 'huge' as any, contrast: 'meh' as any });
        expect(p).toEqual(DEFAULT_APPEARANCE);
    });

    it('respects explicit boolean opt-outs', () => {
        const p = normalizeAppearance({ transparency: false, allowHeavyBlur: false, reducedMotion: true });
        expect(p.transparency).toBe(false);
        expect(p.allowHeavyBlur).toBe(false);
        expect(p.reducedMotion).toBe(true);
    });

    it('resolves system theme from OS hint', () => {
        const p = normalizeAppearance({ theme: 'system' });
        expect(resolveTheme(p, true)).toBe('dark');
        expect(resolveTheme(p, false)).toBe('light');
    });

    it('explicit theme overrides system hint', () => {
        expect(resolveTheme(normalizeAppearance({ theme: 'light' }), true)).toBe('light');
        expect(resolveTheme(normalizeAppearance({ theme: 'dark' }), false)).toBe('dark');
    });

    it('appearance -> css vars caps blur tier per opt-outs', () => {
        const off = appearanceToCssVars(normalizeAppearance({ transparency: false }), false);
        expect(off['--dex-blur-tier']).toBe('off');
        expect(off['--dex-transparency']).toBe('0');

        const eco = appearanceToCssVars(normalizeAppearance({ reducedTransparency: true }), false);
        expect(eco['--dex-blur-tier']).toBe('eco');

        const std = appearanceToCssVars(normalizeAppearance({ allowHeavyBlur: false }), false);
        expect(std['--dex-blur-tier']).toBe('standard');

        const high = appearanceToCssVars(normalizeAppearance({}), true);
        expect(high['--dex-blur-tier']).toBe('high');
        expect(high['--dex-theme']).toBe('dark');
    });

    it('motion var follows reducedMotion', () => {
        expect(appearanceToCssVars(normalizeAppearance({ reducedMotion: true }), false)['--dex-motion']).toBe('off');
        expect(appearanceToCssVars(normalizeAppearance({}), false)['--dex-motion']).toBe('on');
    });

    it('shouldDisableCanvasGlass respects all opt-outs', () => {
        expect(shouldDisableCanvasGlass(normalizeAppearance({}))).toBe(false);
        expect(shouldDisableCanvasGlass(normalizeAppearance({ transparency: false }))).toBe(true);
        expect(shouldDisableCanvasGlass(normalizeAppearance({ reducedTransparency: true }))).toBe(true);
        expect(shouldDisableCanvasGlass(normalizeAppearance({ allowHeavyBlur: false }))).toBe(true);
    });

    it('bus emits to subscribers and skips no-op patches', () => {
        const bus = new ShellAppearanceBus();
        let calls = 0;
        const stop = bus.subscribe(() => calls++);
        bus.set({ density: 'compact' });
        bus.set({ density: 'compact' }); // no change
        bus.set({ density: 'comfortable' });
        expect(calls).toBe(2);
        stop();
        bus.set({ density: 'compact' });
        expect(calls).toBe(2);
        expect(bus.listenerCount()).toBe(0);
    });

    it('bus swallows listener errors so one bad subscriber cannot break others', () => {
        const bus = new ShellAppearanceBus();
        let good = 0;
        bus.subscribe(() => {
            throw new Error('boom');
        });
        bus.subscribe(() => {
            good++;
        });
        bus.set({ density: 'compact' });
        expect(good).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// homeLayoutStore
// ---------------------------------------------------------------------------

describe('homeLayoutStore', () => {
    it('clamps positions and sizes', () => {
        const w = normalizeWidget({ id: 'x', kind: 'app', sourceId: 'a', x: 1.5, y: -0.5, w: 5, h: 0.001, pinned: false, z: 0 });
        expect(w.x).toBeLessThanOrEqual(1);
        expect(w.y).toBeGreaterThanOrEqual(0);
        expect(w.w).toBe(1);
        expect(w.h).toBeGreaterThanOrEqual(0.05);
    });

    it('upsert + remove + list ordered by z then id', () => {
        const s = new HomeLayoutStore();
        s.upsert({ id: 'b', kind: 'app', sourceId: 'b', x: 0, y: 0, w: 0.2, h: 0.2, pinned: false, z: 1 });
        s.upsert({ id: 'a', kind: 'app', sourceId: 'a', x: 0, y: 0, w: 0.2, h: 0.2, pinned: false, z: 1 });
        s.upsert({ id: 'c', kind: 'app', sourceId: 'c', x: 0, y: 0, w: 0.2, h: 0.2, pinned: false, z: 0 });
        expect(s.list().map((w) => w.id)).toEqual(['c', 'a', 'b']);
        expect(s.remove('a')).toBe(true);
        expect(s.remove('a')).toBe(false);
    });

    it('snapshots roll over at cap and restoreAt rewinds', () => {
        const s = new HomeLayoutStore({ maxSnapshots: 2 });
        s.upsert({ id: 'a', kind: 'app', sourceId: 'a', x: 0, y: 0, w: 0.2, h: 0.2, pinned: false, z: 0 });
        s.snapshot('one', 100);
        s.upsert({ id: 'b', kind: 'app', sourceId: 'b', x: 0.2, y: 0, w: 0.2, h: 0.2, pinned: false, z: 0 });
        s.snapshot('two', 200);
        s.upsert({ id: 'c', kind: 'app', sourceId: 'c', x: 0.4, y: 0, w: 0.2, h: 0.2, pinned: false, z: 0 });
        s.snapshot('three', 300);
        const snaps = s.snapshots_();
        expect(snaps.length).toBe(2);
        expect(snaps[0].label).toBe('two');
        expect(s.restoreAt(0)).toBe(true);
        expect(s.list().map((w) => w.id).sort()).toEqual(['a', 'b']);
        expect(s.restoreAt(99)).toBe(false);
    });

    it('togglePin returns null on missing widget', () => {
        const s = new HomeLayoutStore();
        expect(s.togglePin('nope')).toBeNull();
        s.upsert({ id: 'a', kind: 'app', sourceId: 'a', x: 0, y: 0, w: 0.2, h: 0.2, pinned: false, z: 0 });
        expect(s.togglePin('a')).toBe(true);
        expect(s.togglePin('a')).toBe(false);
    });

    it('tidy keeps pinned widgets in place', () => {
        const s = new HomeLayoutStore();
        s.upsert({ id: 'p', kind: 'app', sourceId: 'p', x: 0.5, y: 0.5, w: 0.2, h: 0.2, pinned: true, z: 0 });
        s.upsert({ id: 'a', kind: 'app', sourceId: 'a', x: 0.9, y: 0.9, w: 0.2, h: 0.2, pinned: false, z: 0 });
        s.tidy(2, 0.2);
        const pinned = s.get('p')!;
        expect(pinned.x).toBeCloseTo(0.5);
        expect(pinned.y).toBeCloseTo(0.5);
        const a = s.get('a')!;
        expect(a.x).toBeLessThan(0.9);
    });

    it('serialize / deserialize round trip is tolerant of garbage', () => {
        const s = new HomeLayoutStore();
        s.upsert({ id: 'a', kind: 'app', sourceId: 'a', x: 0.1, y: 0.1, w: 0.2, h: 0.2, pinned: true, z: 5 });
        s.snapshot('t', 1);
        const raw = s.serialize();
        const r = HomeLayoutStore.deserialize(raw);
        expect(r.list().length).toBe(1);
        expect(r.snapshots_().length).toBe(1);
        const empty = HomeLayoutStore.deserialize('{not json');
        expect(empty.list().length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// menuOverflow
// ---------------------------------------------------------------------------

describe('menuOverflow', () => {
    it('keeps everything visible when budget fits', () => {
        const plan = planToolbarOverflow(
            [
                { id: 'a', width: 50 },
                { id: 'b', width: 50 },
            ],
            500
        );
        expect(plan.hasOverflow).toBe(false);
        expect(plan.visibleIds).toEqual(['a', 'b']);
    });

    it('reserves chevron and overflows lowest-priority items first', () => {
        const plan = planToolbarOverflow(
            [
                { id: 'low', width: 100, priority: 0 },
                { id: 'high', width: 100, priority: 10 },
                { id: 'med', width: 100, priority: 5 },
            ],
            220,
            { overflowWidth: 32, gap: 0 }
        );
        expect(plan.hasOverflow).toBe(true);
        expect(plan.visibleIds).toContain('high');
        expect(plan.overflowIds).toContain('low');
    });

    it('pinned items are never collapsed', () => {
        const plan = planToolbarOverflow(
            [
                { id: 'save', width: 200, pinned: true },
                { id: 'help', width: 50 },
            ],
            120,
            { overflowWidth: 32 }
        );
        expect(plan.visibleIds).toContain('save');
        expect(plan.overflowIds).toContain('help');
    });

    it('handles empty input', () => {
        const plan = planToolbarOverflow([], 100);
        expect(plan.hasOverflow).toBe(false);
        expect(plan.visibleIds).toEqual([]);
    });

    it('treats negative widths as zero', () => {
        const plan = planToolbarOverflow([{ id: 'a', width: -50 }], 100);
        expect(plan.hasOverflow).toBe(false);
        expect(plan.visibleIds).toEqual(['a']);
    });
});

// ---------------------------------------------------------------------------
// lockScreenAuth
// ---------------------------------------------------------------------------

describe('lockScreenAuth', () => {
    it('fnv1a is deterministic and 8-hex-char wide', () => {
        const a = fnv1aHex('hello');
        expect(a).toMatch(/^[0-9a-f]{8}$/);
        expect(a).toBe(fnv1aHex('hello'));
        expect(a).not.toBe(fnv1aHex('hellp'));
    });

    it('constantTimeEqual rejects different lengths and content', () => {
        expect(constantTimeEqual('abcd', 'abcd')).toBe(true);
        expect(constantTimeEqual('abcd', 'abce')).toBe(false);
        expect(constantTimeEqual('abcd', 'abcde')).toBe(false);
    });

    it('createPasscodeRecord rejects empty passcode and short salt', () => {
        expect(() => createPasscodeRecord('', 'longenoughsalt')).toThrow();
        expect(() => createPasscodeRecord('1234', 'short')).toThrow();
    });

    it('verifyPasscode accepts correct attempt and resets state', () => {
        const rec = createPasscodeRecord('s3cret', 'salty-salt');
        const r = verifyPasscode(rec, 's3cret', { failures: 4, lockedUntil: 0 }, { now: 1000 });
        expect(r.ok).toBe(true);
        expect(r.state).toEqual(initialAttemptState());
    });

    it('verifyPasscode increments failures and applies backoff', () => {
        const rec = createPasscodeRecord('correct', 'salty-salt');
        let state = initialAttemptState();
        const r1 = verifyPasscode(rec, 'wrong', state, { now: 0 });
        expect(r1.ok).toBe(false);
        expect(r1.state.failures).toBe(1);
        expect(r1.retryAfterMs).toBe(0);
        state = r1.state;

        const r2 = verifyPasscode(rec, 'wrong', state, { now: 0 });
        state = r2.state;
        const r3 = verifyPasscode(rec, 'wrong', state, { now: 0 });
        expect(r3.state.failures).toBe(3);
        expect(r3.retryAfterMs).toBeGreaterThan(0);
        expect(r3.state.lockedUntil).toBeGreaterThan(0);
    });

    it('verifyPasscode rejects attempts during lockout without consuming a failure', () => {
        const rec = createPasscodeRecord('correct', 'salty-salt');
        const locked = { failures: 3, lockedUntil: 10_000 };
        const r = verifyPasscode(rec, 'correct', locked, { now: 5_000 });
        expect(r.ok).toBe(false);
        expect(r.state).toBe(locked); // same reference, no mutation
        expect(r.retryAfterMs).toBe(5_000);
    });
});

// ---------------------------------------------------------------------------
// workspaceSnapshot
// ---------------------------------------------------------------------------

describe('workspaceSnapshot', () => {
    const sampleWindows = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
            id: `w${i}`,
            appId: 'app',
            x: i * 10,
            y: i * 10,
            width: 200,
            height: 100,
            minimized: false,
            maximized: false,
            z: i,
        }));

    it('saveNamed enforces cap by oldest createdAt', () => {
        const s = new WorkspaceSnapshotStore({ maxNamed: 2 });
        s.saveNamed(s.capture('a', sampleWindows(1), null, 100));
        s.saveNamed(s.capture('b', sampleWindows(1), null, 200));
        s.saveNamed(s.capture('c', sampleWindows(1), null, 300));
        const labels = s.listNamed().map((x) => x.label).sort();
        expect(labels).toEqual(['b', 'c']);
    });

    it('saveAuto rolls and exposes latestAuto', () => {
        const s = new WorkspaceSnapshotStore({ maxAuto: 2 });
        s.saveAuto(s.capture('x', sampleWindows(1), null, 1));
        s.saveAuto(s.capture('y', sampleWindows(1), null, 2));
        s.saveAuto(s.capture('z', sampleWindows(1), null, 3));
        expect(s.listAuto().map((s) => s.label)).toEqual(['y', 'z']);
        expect(s.latestAuto()?.label).toBe('z');
    });

    it('diffSnapshots reports add/remove/move/resize/focus', () => {
        const a = {
            version: 1 as const,
            label: 'a',
            createdAt: 0,
            focusedId: 'w0',
            windows: sampleWindows(2),
        };
        const b = {
            version: 1 as const,
            label: 'b',
            createdAt: 0,
            focusedId: 'w1',
            windows: [
                { ...sampleWindows(1)[0], x: 999 },
                {
                    id: 'w2',
                    appId: 'app',
                    x: 0,
                    y: 0,
                    width: 50,
                    height: 50,
                    minimized: false,
                    maximized: false,
                    z: 0,
                },
            ],
        };
        const d = diffSnapshots(a, b);
        expect(d.added).toEqual(['w2']);
        expect(d.removed).toEqual(['w1']);
        expect(d.moved).toEqual(['w0']);
        expect(d.focusChanged).toBe(true);
    });

    it('serialize / deserialize tolerates malformed input', () => {
        const s = new WorkspaceSnapshotStore();
        s.saveNamed(s.capture('a', sampleWindows(1), 'w0', 1));
        const raw = s.serialize();
        const r = WorkspaceSnapshotStore.deserialize(raw);
        expect(r.listNamed().length).toBe(1);
        expect(WorkspaceSnapshotStore.deserialize('{nope').listNamed().length).toBe(0);
    });

    it('clones placement so external mutation is isolated', () => {
        const s = new WorkspaceSnapshotStore();
        const win = sampleWindows(1);
        const snap = s.capture('a', win, null);
        win[0].x = 9999;
        expect(snap.windows[0].x).not.toBe(9999);
    });
});

// ---------------------------------------------------------------------------
// calmFocus
// ---------------------------------------------------------------------------

describe('calmFocus', () => {
    it('allows everything when there is no flow', () => {
        const e = new CalmFocusEngine();
        expect(e.decide('hoverGlow').allow).toBe(true);
        expect(e.decide('celebration').allow).toBe(true);
    });

    it('suppresses non-essential during high activity', () => {
        const e = new CalmFocusEngine({ flowThreshold: 5, windowMs: 60_000 });
        const t0 = 1_000;
        for (let i = 0; i < 50; i++) e.recordActivity(t0 + i);
        const d = e.decide('hoverGlow', t0 + 100);
        expect(d.allow).toBe(false);
        expect(d.reason).toBe('flow-suppressed');

        const allowed = e.decide('notification', t0 + 100);
        expect(allowed.allow).toBe(true); // notifications are always-allow by default
    });

    it('manual DND blocks even allowlisted items if removed from list', () => {
        const e = new CalmFocusEngine({ alwaysAllow: [] });
        e.setDoNotDisturb(10_000);
        const d = e.decide('notification', 5_000);
        expect(d.allow).toBe(false);
        expect(d.reason).toBe('manual-do-not-disturb');
    });

    it('activityRate scales per minute', () => {
        const e = new CalmFocusEngine({ windowMs: 60_000 });
        const t0 = 0;
        for (let i = 0; i < 60; i++) e.recordActivity(t0 + i * 100);
        const rate = e.activityRate(t0 + 60 * 100);
        expect(rate).toBeGreaterThan(0);
    });

    it('default config matches DEFAULT_CALM', () => {
        expect(DEFAULT_CALM.windowMs).toBe(60_000);
    });
});

// ---------------------------------------------------------------------------
// splashTransition
// ---------------------------------------------------------------------------

describe('splashTransition', () => {
    it('starts at idle and advances through home-ready to done', () => {
        const s = new SplashSequencer({ minSplashMs: 100, maxSplashMs: 5000, fadeMs: 50 });
        expect(s.snapshot().state).toBe('idle');
        s.start(0);
        expect(s.snapshot().state).toBe('splash');
        s.markHomeReady(50);
        expect(s.tick(50).toString()).toMatch(/splash|home-ready/); // not yet past minSplash
        s.tick(150);
        expect(s.snapshot().state).toBe('home-ready');
        s.tick(250);
        expect(s.snapshot().state).toBe('done');
    });

    it('forces advance after maxSplashMs even without home-ready', () => {
        const s = new SplashSequencer({ minSplashMs: 0, maxSplashMs: 100, fadeMs: 0 });
        s.start(0);
        const state = s.tick(200);
        expect(state === 'home-ready' || state === 'done').toBe(true);
    });

    it('splashOpacity fades from 1 to 0', () => {
        const s = new SplashSequencer({ minSplashMs: 0, maxSplashMs: 1000, fadeMs: 100 });
        s.start(0);
        expect(s.splashOpacity(0)).toBe(1);
        s.markHomeReady(0);
        expect(s.splashOpacity(50)).toBeGreaterThan(0);
        expect(s.splashOpacity(50)).toBeLessThan(1);
        expect(s.splashOpacity(200)).toBe(0);
    });

    it('uses default timings when unspecified', () => {
        const s = new SplashSequencer();
        expect(s.snapshot().state).toBe('idle');
        expect(DEFAULT_TIMINGS.minSplashMs).toBeGreaterThan(0);
    });

    it('markRestoring auto-starts if idle', () => {
        const s = new SplashSequencer();
        s.markRestoring(10);
        expect(s.snapshot().log.splashStartedAt).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// releaseAudit
// ---------------------------------------------------------------------------

describe('releaseAudit', () => {
    it('flags forbidden substrings', () => {
        const r = auditSources([{ path: 'a.ts', text: 'TODO_BLOCKER fix this' }]);
        expect(r.clean).toBe(false);
        expect(r.findings[0].rule).toBe('forbidden-substring');
    });

    it('flags orphan z-indices outside the allowlist', () => {
        const r = auditSources([{ path: 'a.css', text: '.x { z-index: 47; }' }]);
        expect(r.findings.some((f) => f.rule === 'orphan-z-index')).toBe(true);
    });

    it('does not flag allowlisted z-indices', () => {
        const r = auditSources([{ path: 'a.css', text: '.x { z-index: 100; }' }]);
        expect(r.findings.length).toBe(0);
    });

    it('flags inline color literals only inside style props', () => {
        const inStyle = auditSources([{ path: 'a.tsx', text: 'const x = <div style={{color: "#abc"}} />' }]);
        expect(inStyle.findings.some((f) => f.rule === 'inline-color')).toBe(true);

        const notInStyle = auditSources([{ path: 'a.ts', text: 'const TOKEN = "#abc";' }]);
        expect(notInStyle.findings.length).toBe(0);
    });

    it('returns clean=true on empty input', () => {
        const r = auditSources([]);
        expect(r.clean).toBe(true);
        expect(r.filesScanned).toBe(0);
    });

    it('exposes a default config object', () => {
        expect(DEFAULT_AUDIT_CONFIG.allowedZIndices.length).toBeGreaterThan(0);
        expect(DEFAULT_APPEARANCE.transparency).toBe(true);
    });
});
