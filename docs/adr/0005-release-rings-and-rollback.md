# 0005. Release rings and rollback policy

Date: 2026-05-13

## Status

Accepted

## Context

DEX ships frequent releases (currently every wave of `improvements500`).
The existing process pushes a tag to `main` and lets `electron-builder`
produce the artifact. There is no graduated rollout, no health-based
rollback, and no documented criteria for promoting a release from internal
testing to general availability.

Master Evolution Plan Phase 0 calls for explicit release ring policy and
rollback criteria. Phase 10 (continuous release gate) depends on these.

## Decision

We adopt a four-ring release model with health-gated promotion and
automated rollback:

1. `dev` ring. Every push to `main` produces an artifact for internal
   contributors. No KPI gates.
2. `canary` ring. Tagged releases enter `canary` automatically once the
   release artifact is signed. KPI gates from `docs/KPI_BASELINES.md`
   apply: crash-free sessions over the canary cohort must remain at or
   above the documented threshold for 24 hours before promotion.
3. `beta` ring. Manual promotion from `canary` after KPI gates pass for
   72 hours. Beta runs for at least one week before promotion to stable.
4. `stable` ring. General availability. Manual promotion from `beta` after
   KPI gates pass for the documented stable window.

Rollback is automatic when the composite health score (see
`src/renderer/improvements500/healthScore.ts`) drops into the `critical`
band for two consecutive measurement windows on a given ring. Rollback
republishes the prior signed artifact for that ring and freezes promotion
into the affected ring until the next ADR-tracked decision unfreezes it.

`ReleaseManager` (`src/main/core/ReleaseManager.ts`) owns ring assignment
and rollback execution. Promotion decisions are recorded in
`docs/RELEASE_NOTES.md` with the responsible owner.

## Consequences

- Users on `stable` are insulated from regressions caught earlier in the
  pipeline.
- Releases take longer to reach `stable`. We accept this for reliability.
- Rollback automation depends on the health score signals being instrumented
  end to end, which is a Phase 1 deliverable.

## Alternatives Considered

- Two-ring model (`canary`, `stable`). Rejected because it does not give
  enough exposure time for slow-burn regressions.
- Pure manual promotion with no automatic rollback. Rejected because manual
  rollback is too slow when a release is actively crashing user sessions.
