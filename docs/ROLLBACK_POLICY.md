# Rollback Policy

Phase 0 deliverable. Implements [ADR 0005](adr/0005-release-rings-and-rollback.md).
Companion to [docs/RELEASE_RINGS.md](RELEASE_RINGS.md) and
[docs/KPI_BASELINES.md](KPI_BASELINES.md).

## Triggers

Rollback is initiated automatically when any of the following holds for a
ring:

1. Composite health score (`computeHealthScore`) reports the `critical`
   band for two consecutive 5-minute measurement windows.
2. Crash-free sessions over the ring cohort drop below the ring's gate
   threshold for any 30-minute window.
3. Any data-corruption signal fires once. Data corruption is treated as
   non-recoverable forward-only.
4. Update install failure rate exceeds 5 percent over the ring's first
   24 hours of exposure.

Operators may also initiate manual rollback with a recorded rationale.

## Procedure

`ReleaseManager.rollback(ring)` performs:

1. Mark the offending release `quarantined` in the release database.
2. Republish the prior signed artifact for that ring.
3. Freeze promotion into and out of the ring until an unfreeze decision.
4. Append an incident block to `docs/RELEASE_NOTES.md` with timestamp,
   ring, trigger, prior release id, and replacement release id.
5. Notify the on-call owner.

## Owner responsibilities post-rollback

1. Within 24 hours: open a root-cause analysis ticket and link it from the
   release notes incident block.
2. Within 7 days: ship a fix or a documented mitigation, then unfreeze the
   ring.
3. If the same regression class recurs within 30 days, the responsible
   workstream owes a Phase 0 ADR documenting the prevention plan before
   the next promotion.

## Forward-fix ban during freeze

While a ring is frozen, no new release may be promoted into the affected
ring or any downstream ring. Forward-fixes are tested in `dev` and `canary`
only, then promoted through the normal gate after the ring is unfrozen.

## Data-corruption escalation

Data-corruption rollback also triggers:

- Read-only mode for the affected workspace component on user systems.
- Mandatory write-ahead log replay during the next launch.
- Mandatory user-facing notice with a link to the recovery report.

These behaviors are owned by `CrashRecoverySystem`
(`src/main/core/CrashRecoverySystem.ts`) and must remain wired even when
the rollback path itself is exercised.
