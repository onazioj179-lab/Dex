# Dependency Map

Phase 0 deliverable. Names the binding dependencies between Master
Evolution Plan phases (see `/memories/session/plan.md` and
[ADR 0002](adr/0002-master-evolution-plan-phasing.md)).

## Phase graph

```
Phase 0 (Governance)
  |
  v
Phase 1 (Platform Unification)
  |--> Phase 2 (UKI Intelligence)        ----+
  |--> Phase 3 (Workflow + Multitasking) -+  |
  |--> Phase 4 (Compositor + Performance) +--+--> Phase 5 (Creative)
  |                                       |  |
  |                                       +--+--> Phase 6 (Search + Semantic)
  |                                                  |
  |                                                  +--> Phase 7 (Continuity + Nexus)
  |                                                  |
  |                                                  +--> Phase 8 (Cross-app Intelligence)
  |                                                            |
  |                                                            v
  |                                                       Phase 9 (A11y + Collab)
  |
  v
Phase 10 (Reliability) -- continuous release gate, applies to every phase
  |
  v
Phase 11 (Future Infrastructure) -- requires all prior phases shipped
```

## Hard dependencies

- Phase 0 blocks every other phase.
- Phase 1 blocks Phases 2, 3, 4, 5, 6.
- Phases 3 and 4 jointly block Phases 5 and 6.
- Phase 6 blocks Phases 7 and 8.
- Phase 8 blocks Phase 9.
- Phase 10 is a continuous release gate.
- Phase 11 may not begin until every prior phase has shipped at least one
  release-gated milestone.

## Cross-cutting dependencies

| Producer (Phase) | Consumer | Surface |
|---|---|---|
| 1 | 3, 6, 7, 8 | IPC contracts and registry. |
| 1 | 2, 4, 5 | Observability/event correlation. |
| 1 | 3, 6, 9 | Unified shell error boundary. |
| 1 | 6 | Single search orchestrator. |
| 2 | 6, 7, 8 | UKI fact provenance and retrieval reranking. |
| 3 | 5, 6, 7, 9 | Canonical window/workspace lifecycle store. |
| 4 | 5 | Frame pacing, GPU memory pressure, render queue. |
| 6 | 7, 8 | Unified search results and intent classifier. |
| 7 | 8 | Continuity graph and resumable session handles. |
| 8 | 9 | Shared context bus + workflow composer. |

## Shared platform layers (consumed by every later phase)

- `src/renderer/improvements500/` shared primitive layer
  (see [ADR 0003](adr/0003-improvements500-shared-primitives.md)).
- `src/main/security/IPCValidator.ts` and the IPC contract registry
  (Phase 1, see [ADR 0004](adr/0004-ipc-contract-formalization.md)).
- `src/main/core/StartupSequencer.ts` (boot phases and budgets).
- `src/main/core/CrashRecoverySystem.ts` (continuity and recovery).
- `src/main/core/ReleaseManager.ts` (ring management and rollback,
  see [ADR 0005](adr/0005-release-rings-and-rollback.md)).
- `src/renderer/core/UniversalCore.ts` (renderer health and frame budget).
- `src/renderer/uki/cache.ts` and `src/renderer/uki/memory.ts` (UKI).
- `native/src/lib.rs` (native runtime critical path).

## Risk hotspots inherited from `docs/AUDIT_REPORT.md`

These must be addressed in Phase 1 before downstream phases consume them:

1. Multiple overlapping search implementations across renderer surfaces.
2. Multiple `AppErrorBoundary` classes with divergent recovery logic.
3. IPC channels registered outside `IPCValidator`.
4. Missing end-to-end correlation IDs on IPC traffic.
