# Release Rings

Phase 0 deliverable. Implements [ADR 0005](adr/0005-release-rings-and-rollback.md).

## Rings

| Ring | Audience | Promoted from | Promotion criteria |
|---|---|---|---|
| `dev` | Internal contributors only | Every push to `main` | None. Build green. |
| `canary` | Opt-in early adopters | Tagged release on `main` | Signed artifact + KPI gates pass for 24 h. |
| `beta` | Opt-in beta users | Manual promotion from `canary` | KPI gates pass for 72 h on `canary`. |
| `stable` | All users | Manual promotion from `beta` | KPI gates pass for 7 days on `beta`. |

## KPI gates (per [docs/KPI_BASELINES.md](KPI_BASELINES.md))

A ring "passes" the gate when, over the documented window:

- Crash-free sessions meet or exceed the ring's threshold.
- Update rollback success meets or exceeds the ring's threshold.
- Composite health score (`computeHealthScore`) stays out of the `critical`
  band on every measurement window.
- No P0/P1 incident is open against the release.

If any gate condition is not met, promotion is blocked and the responsible
owner files an incident in `docs/RELEASE_NOTES.md`.

## Promotion workflow

1. CI tags `main` after a green build. `ReleaseManager`
   (`src/main/core/ReleaseManager.ts`) publishes the artifact to the `dev`
   ring immediately and to the `canary` ring once signing completes.
2. Health telemetry from the `canary` cohort flows into the composite
   health score.
3. Promotion to `beta` is an explicit owner action (currently the project
   maintainer) recorded in `docs/RELEASE_NOTES.md`.
4. Promotion to `stable` is the same workflow, with the longer dwell time.

## Rollback

Automatic rollback (per [ADR 0005](adr/0005-release-rings-and-rollback.md))
runs when:

- The composite health score is in the `critical` band for two consecutive
  5-minute windows on a given ring.
- Or any data-corruption signal fires once.

Rollback republishes the prior signed artifact for that ring and freezes
the ring (no further promotions in or out) until an owner unfreezes it.
The freeze is recorded in `docs/RELEASE_NOTES.md`.

## Manual rollback (operator escape hatch)

Operators may force rollback for a ring without waiting for the automated
gate. Use only when an unmonitored regression is observed externally.
Document the rationale in `docs/RELEASE_NOTES.md` within 24 hours.
