// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Verified-finding implementations (DEX_FEATURE_BACKLOG 05/07): WCAG 2.2 target
// size (SC 2.5.8), Fluent size-proportional motion, and the rpm-ostree-style
// transactional rollback-safe deployment model.
import { describe, it, expect } from 'vitest';
import {
  meetsMinimumSize, spacingSatisfied, evaluateTarget, auditRects, TARGET_MIN,
} from '../../src/shared/a11y/targetSize';
import {
  motionDuration, bandForSize, motionDurationForSize,
} from '../../src/shared/motion/motionScale';
import {
  stageDeployment, finalizeStaged, rollback, prune, verifyIntegrity, bootedDeployment,
  UpdateError, type DeploymentState,
} from '../../src/shared/update/transactionalUpdate';

describe('WCAG 2.2 SC 2.5.8 — target size', () => {
  it('passes targets >= 24x24', () => {
    expect(meetsMinimumSize(24, 24)).toBe(true);
    expect(meetsMinimumSize(23, 40)).toBe(false);
    expect(TARGET_MIN).toBe(24);
  });
  it('an isolated undersized target passes via spacing (spec-faithful) but fails in strict mode', () => {
    const t = { id: 'a', x: 0, y: 0, w: 16, h: 16 };
    expect(evaluateTarget(t, []).passes).toBe(true);                  // spacing exception
    expect(evaluateTarget(t, [], {}, { strict: true }).passes).toBe(false); // DEX audit
  });
  it('honours the spacing exception when 24px circles do not intersect', () => {
    const a = { id: 'a', x: 0, y: 0, w: 16, h: 16 };       // center (8,8)
    const far = { id: 'b', x: 40, y: 0, w: 16, h: 16 };    // center (48,8) — dist 40 >= 24
    const near = { id: 'c', x: 10, y: 0, w: 16, h: 16 };   // center (18,8) — dist 10 < 24
    expect(spacingSatisfied(a, [far])).toBe(true);
    expect(spacingSatisfied(a, [near])).toBe(false);
    expect(evaluateTarget(a, [far]).passes).toBe(true);
    expect(evaluateTarget(a, [near]).passes).toBe(false);
  });
  it('honours inline / essential / equivalent exceptions', () => {
    const t = { id: 't', x: 0, y: 0, w: 12, h: 12 };
    expect(evaluateTarget(t, [], { inline: true }).passes).toBe(true);
    expect(evaluateTarget(t, [], { essential: true }).passes).toBe(true);
    expect(evaluateTarget(t, [], { equivalent: true }).passes).toBe(true);
  });
  it('auditRects returns only failures', () => {
    const fails = auditRects([
      { id: 'ok', x: 0, y: 0, w: 32, h: 32 },
      { id: 'bad', x: 100, y: 100, w: 10, h: 10 },
    ]);
    expect(fails.map((f) => f.id)).toEqual(['bad']);
  });
});

describe('Fluent size-proportional motion', () => {
  it('larger elements get longer durations', () => {
    expect(motionDuration('micro')).toBeLessThan(motionDuration('small'));
    expect(motionDuration('small')).toBeLessThan(motionDuration('medium'));
    expect(motionDuration('medium')).toBeLessThan(motionDuration('large'));
    expect(motionDuration('large')).toBeLessThan(motionDuration('fullscreen'));
  });
  it('reduced motion collapses to a single frame', () => {
    expect(motionDuration('fullscreen', { reducedMotion: true })).toBe(1);
  });
  it('applies a speed scale', () => {
    expect(motionDuration('medium', { scale: 2 })).toBe(motionDuration('medium') * 2);
  });
  it('bands a measured size and derives a duration', () => {
    expect(bandForSize(32)).toBe('micro');
    expect(bandForSize(120)).toBe('small');
    expect(bandForSize(1600)).toBe('fullscreen');
    expect(motionDurationForSize(1600)).toBe(motionDuration('fullscreen'));
  });
});

describe('rpm-ostree-style transactional deployments', () => {
  const cs = (v: number) => `sum-${v}`;
  const base = (): DeploymentState => ({
    retain: 2,
    deployments: [{ version: 1, checksum: cs(1), booted: true, staged: false, pinned: false }],
  });

  it('stages a newer deployment without unbooting the current one', () => {
    const s = stageDeployment(base(), { version: 2, checksum: cs(2) }, cs);
    expect(bootedDeployment(s)?.version).toBe(1);       // still booted on v1
    expect(s.deployments.find((d) => d.version === 2)?.staged).toBe(true);
  });
  it('rejects a downgrade, a duplicate, and a checksum mismatch', () => {
    expect(() => stageDeployment(base(), { version: 1, checksum: cs(1) }, cs)).toThrow(UpdateError);
    expect(() => stageDeployment(base(), { version: 2, checksum: 'WRONG' }, cs)).toThrow(/checksum/);
  });
  it('finalize promotes the staged deployment to booted', () => {
    let s = stageDeployment(base(), { version: 2, checksum: cs(2) }, cs);
    s = finalizeStaged(s);
    expect(bootedDeployment(s)?.version).toBe(2);
    expect(s.deployments.find((d) => d.version === 1)?.booted).toBe(false);
  });
  it('rolls back to the prior deployment in one step', () => {
    let s = stageDeployment(base(), { version: 2, checksum: cs(2) }, cs);
    s = finalizeStaged(s);
    s = rollback(s);
    expect(bootedDeployment(s)?.version).toBe(1);
  });
  it('rollback throws when there is nothing older', () => {
    expect(() => rollback(base())).toThrow(/no prior/);
  });
  it('prune keeps booted + pinned but drops old unpinned deployments', () => {
    const state: DeploymentState = {
      retain: 1,
      deployments: [
        { version: 4, checksum: cs(4), booted: true, staged: false, pinned: false },
        { version: 3, checksum: cs(3), booted: false, staged: false, pinned: false },
        { version: 2, checksum: cs(2), booted: false, staged: false, pinned: false },
        { version: 1, checksum: cs(1), booted: false, staged: false, pinned: true },
      ],
    };
    const pruned = prune(state);
    const versions = pruned.deployments.map((d) => d.version).sort((a, b) => b - a);
    expect(versions).toContain(4); // booted
    expect(versions).toContain(1); // pinned
    expect(versions).toContain(3); // most-recent retained
    expect(versions).not.toContain(2); // dropped
  });
  it('verifyIntegrity flags a corrupt deployment', () => {
    const state: DeploymentState = {
      retain: 2,
      deployments: [{ version: 1, checksum: 'tampered', booted: true, staged: false, pinned: false }],
    };
    const r = verifyIntegrity(state, cs);
    expect(r.ok).toBe(false);
    expect(r.corrupt).toEqual([1]);
  });
});
