// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Transactional, rollback-safe deployment model (DEX_FEATURE_BACKLOG 07, P2).
 *
 * Steal from rpm-ostree (verified): updates are transactional, versioned and
 * checksummed; a new deployment is STAGED as a separate root that does not mutate
 * the booted one, so a bad update is a one-step rollback to the prior known-good
 * deployment rather than an in-place repair. This is the pure state machine for
 * that: a bounded, ordered list of deployments (newest first), exactly one
 * `booted`, optional `staged` (applies on next restart), with stage / rollback /
 * finalize / prune transitions and a checksum-integrity guard.
 *
 * Pure: no IO, no filesystem. The host driver (installer / update service) does
 * the real file swap; this owns the rules so they stay testable.
 *
 * Source: https://coreos.github.io/rpm-ostree/ (3-vote verified).
 */

export interface Deployment {
  /** Monotonic version (higher = newer). */
  version: number;
  /** Content checksum of the deployment (integrity gate). */
  checksum: string;
  /** Currently running. Exactly one deployment is booted. */
  booted: boolean;
  /** Will become booted on next restart (a staged, not-yet-live update). */
  staged: boolean;
  /** Pinned deployments are never pruned (e.g. a known-good baseline). */
  pinned: boolean;
}

export interface DeploymentState {
  /** Newest first. */
  deployments: Deployment[];
  /** How many deployments to retain (older, unpinned ones are pruned). */
  retain: number;
}

export class UpdateError extends Error {}

function sortNewestFirst(d: Deployment[]): Deployment[] {
  return [...d].sort((a, b) => b.version - a.version);
}

/** The deployment currently booted, or null if none. */
export function bootedDeployment(state: DeploymentState): Deployment | null {
  return state.deployments.find((d) => d.booted) ?? null;
}

/** The staged (pending-restart) deployment, or null. */
export function stagedDeployment(state: DeploymentState): Deployment | null {
  return state.deployments.find((d) => d.staged) ?? null;
}

/**
 * Stage a new deployment WITHOUT touching the booted one (the core rpm-ostree
 * invariant). Rejects a downgrade, a duplicate version, or a checksum mismatch.
 */
export function stageDeployment(
  state: DeploymentState,
  next: { version: number; checksum: string },
  computeChecksum: (version: number) => string,
): DeploymentState {
  const booted = bootedDeployment(state);
  if (booted && next.version <= booted.version) {
    throw new UpdateError(`refusing to stage version ${next.version} <= booted ${booted.version}`);
  }
  if (state.deployments.some((d) => d.version === next.version)) {
    throw new UpdateError(`version ${next.version} already deployed`);
  }
  if (computeChecksum(next.version) !== next.checksum) {
    throw new UpdateError('checksum mismatch — refusing to stage a tampered/corrupt update');
  }
  const cleared = state.deployments.map((d) => ({ ...d, staged: false }));
  const staged: Deployment = { version: next.version, checksum: next.checksum, booted: false, staged: true, pinned: false };
  return prune({ ...state, deployments: sortNewestFirst([...cleared, staged]) });
}

/**
 * Finalize the staged deployment as booted (called on the next restart). The
 * previously-booted deployment stays in the list as the rollback target.
 */
export function finalizeStaged(state: DeploymentState): DeploymentState {
  const staged = stagedDeployment(state);
  if (!staged) throw new UpdateError('no staged deployment to finalize');
  const deployments = state.deployments.map((d) => ({
    ...d,
    booted: d.version === staged.version,
    staged: false,
  }));
  return { ...state, deployments: sortNewestFirst(deployments) };
}

/**
 * Roll back to the most recent deployment OLDER than the booted one — the
 * one-step recovery from a bad update. Throws if there is nothing to roll back to.
 */
export function rollback(state: DeploymentState): DeploymentState {
  const booted = bootedDeployment(state);
  if (!booted) throw new UpdateError('no booted deployment');
  const prior = sortNewestFirst(state.deployments).find((d) => d.version < booted.version);
  if (!prior) throw new UpdateError('no prior deployment to roll back to');
  const deployments = state.deployments.map((d) => ({
    ...d,
    booted: d.version === prior.version,
    staged: false,
  }));
  return { ...state, deployments: sortNewestFirst(deployments) };
}

/**
 * Prune old, unpinned, non-booted, non-staged deployments down to `retain`.
 * The booted, staged and pinned deployments are always kept.
 */
export function prune(state: DeploymentState): DeploymentState {
  const retain = Math.max(1, state.retain);
  const ordered = sortNewestFirst(state.deployments);
  let kept = 0;
  const out: Deployment[] = [];
  for (const d of ordered) {
    if (d.booted || d.staged || d.pinned) { out.push(d); continue; }
    if (kept < retain) { out.push(d); kept++; }
    // else: drop this old deployment
  }
  return { ...state, deployments: sortNewestFirst(out) };
}

/** Integrity check: every deployment's checksum still matches its content. */
export function verifyIntegrity(
  state: DeploymentState,
  computeChecksum: (version: number) => string,
): { ok: boolean; corrupt: number[] } {
  const corrupt = state.deployments
    .filter((d) => computeChecksum(d.version) !== d.checksum)
    .map((d) => d.version);
  return { ok: corrupt.length === 0, corrupt };
}
