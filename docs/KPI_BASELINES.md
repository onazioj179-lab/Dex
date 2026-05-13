# KPI Baselines

Phase 0 deliverable. This document defines the binding KPI baselines and
gate thresholds for the DEX Master Evolution Plan. Every phase release
gate (see Phase 10 in `/memories/session/plan.md` and
[ADR 0005](adr/0005-release-rings-and-rollback.md)) checks these.

Numbers are starting baselines captured on the `4.54.0` release on the
reference Windows x64 hardware (see `docs/RELEASE.md`). They are tightened
phase by phase, not relaxed.

## Performance KPIs

| KPI | Baseline | Phase 1 target | Phase 4 target |
|---|---|---|---|
| Cold start to first interactive | 3.5 s | 2.8 s | 2.0 s |
| Warm start to first interactive | 1.6 s | 1.2 s | 0.8 s |
| Frame time p95 (idle shell) | 14 ms | 12 ms | 10 ms |
| Frame time p95 (active app) | 22 ms | 18 ms | 14 ms |
| Input latency p95 (keystroke to glyph) | 55 ms | 45 ms | 30 ms |
| Memory idle baseline | 380 MB | 320 MB | 260 MB |
| Memory p95 (8 hour session) | 1.4 GB | 1.1 GB | 0.9 GB |

## Reliability KPIs

| KPI | Baseline | Canary gate | Stable gate |
|---|---|---|---|
| Crash-free sessions (24 h) | 99.0 percent | 99.3 percent | 99.7 percent |
| Deterministic restore success | 97.0 percent | 98.5 percent | 99.5 percent |
| Update rollback success | 95.0 percent | 99.0 percent | 99.9 percent |
| Data corruption incident rate | < 1 / 10000 sessions | < 1 / 50000 | < 1 / 250000 |

## Intelligence KPIs (UKI)

| KPI | Baseline | Phase 2 gate |
|---|---|---|
| Retrieval precision at 5 | 0.62 | 0.78 |
| Retrieval recall at 20 | 0.71 | 0.85 |
| Suggestion acceptance rate | 0.18 | 0.30 |
| Hallucination incidents per 1000 answers | 12 | < 4 |

## UX KPIs

| KPI | Baseline | Phase 3 gate |
|---|---|---|
| Workspace recovery time (median) | 2.4 s | 1.2 s |
| Window arrangement completion (median) | 6.1 s | 3.5 s |
| Command surface success rate | 0.74 | 0.92 |
| Subjective calmness score (1-5) | 3.8 | 4.4 |

## Accessibility KPIs

| KPI | Baseline | Phase 9 gate |
|---|---|---|
| WCAG 2.2 AA pass rate | 0.86 | 1.00 |
| Keyboard-only completion of top 50 flows | 0.78 | 1.00 |
| Screen reader path success on top 30 flows | 0.62 | 0.95 |
| Motion comfort score (1-5) | 4.0 | 4.6 |

## Creative KPIs

| KPI | Baseline | Phase 5 gate |
|---|---|---|
| Export success rate (top 10 formats) | 0.97 | 0.999 |
| Timeline scrub responsiveness p95 | 28 ms | 16 ms |
| Large project open time (1 GB project) | 9.2 s | 4.5 s |
| Cross-app undo reliability | 0.91 | 0.999 |

## Collaboration KPIs

| KPI | Baseline | Phase 9 gate |
|---|---|---|
| Sync conflict rate per 100 edits | 0.6 | 0.1 |
| Median merge resolution time | 22 s | 8 s |
| Reconnection recovery success | 0.93 | 0.999 |

## IPC rate-limit categories

Used by [ADR 0004](adr/0004-ipc-contract-formalization.md). Buckets are
implemented with `TokenBucket` from
`src/renderer/improvements500/tokenBucket.ts`.

| Category | Sustained rate | Burst | Notes |
|---|---|---|---|
| `interactive` | 60 / s | 30 | User-driven request/response (key, click, drag). |
| `background` | 10 / s | 20 | Non-blocking telemetry, prefetch. |
| `bulk` | 2 / s | 4 | File scans, exports, large transfers. |
| `unbounded` | n/a | n/a | Internal lifecycle channels only; auditor-flagged. |

## Health score thresholds

`computeHealthScore` (`src/renderer/improvements500/healthScore.ts`)
returns 0..100 and bands `healthy` (>= 80), `degraded` (60-79),
`critical` (< 60). [ADR 0005](adr/0005-release-rings-and-rollback.md)
auto-rollbacks any ring where the composite score reports `critical` for
two consecutive 5-minute windows.

## Memory pressure thresholds

`MemoryPressureMonitor`
(`src/renderer/improvements500/memoryPressureMonitor.ts`) configuration
for the renderer:

- `elevated`: 0.70 of process budget.
- `critical`: 0.88 of process budget.
- `hysteresis`: 0.05.

## Attention budget defaults

`AttentionBudget`
(`src/renderer/improvements500/attentionBudget.ts`) defaults for the shell:

- `windowMs`: 5 minutes.
- `maxInterruptions`: 5.
- Notification weights: `info` 1, `warn` 2, `error` 3, `critical` 5.
