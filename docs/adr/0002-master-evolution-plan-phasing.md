# 0002. Master Evolution Plan phasing

Date: 2026-05-13

## Status

Accepted

## Context

DEX is entering a multi-quarter modernization program covering 510 categorized
improvements across 15 strategic areas. Earlier prototypes attempted to ship
features across all areas in parallel and produced cross-cutting regressions
because shared platform layers were unstable.

The Master Evolution Plan in `/memories/session/plan.md` documents a
12-phase sequence with explicit hard dependencies:

- Phase 0 governs the program (this ADR is a Phase 0 deliverable).
- Phase 1 unifies the platform (search, error boundaries, IPC contracts,
  observability).
- Phases 2-9 deliver feature-area workstreams.
- Phase 10 runs continuously as the release gate.
- Phase 11 prepares future infrastructure once everything else is stable.

## Decision

We will execute the Master Evolution Plan phases in the documented order.
The following dependency rules are binding:

1. Phase 0 blocks all downstream work. No Phase 1+ ADR may be marked
   `Accepted` until Phase 0 governance documents are landed.
2. Phase 1 blocks Phases 3-6. Feature work may proceed only on top of the
   unified platform layer.
3. Phases 3 and 4 jointly block Phases 5 and 6.
4. Phase 6 blocks Phases 7 and 8.
5. Phase 8 blocks Phase 9.
6. Phase 10 is a continuous release gate; every phase must pass its release
   gate before its work is published to a release ring beyond `dev`.
7. Phase 11 may not begin until all prior phases have shipped at least one
   release-gated milestone.

Workstreams may run in parallel inside a phase as long as they share no
mutable platform surface; cross-phase parallelism is not allowed.

## Consequences

- Predictable sequencing reduces cross-phase regressions.
- Shared primitives land before their consumers, removing rewrites.
- Some feature work is gated waiting on platform deliverables. Teams should
  use that time to extend the `improvements500` shared-primitive library
  (see ADR 0003) so the foundation grows even when feature work is paused.

## Alternatives Considered

- Strict waterfall with no parallelism inside a phase. Rejected as too slow
  for our cadence.
- Free-for-all parallel phases. Rejected based on prior experience with
  cross-cutting regressions.
