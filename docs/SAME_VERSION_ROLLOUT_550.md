# DEX Same-Version Rollout (550 Creative-Priority Items)

Target train: 4.3.x-same-train

This rollout consumes generated artifacts:
- docs/MASTER_BACKLOG_1000.csv
- docs/MASTER_BACKLOG_1000.json
- docs/CREATIVE_500_PLUS_QUEUE.csv

## Objective

Execute the full backlog in one continuous version train without waiting for a major-version reset.

## Execution Model

- Parallel stream count: 12
- Stream throughput target: 4-6 items per stream per week
- Net throughput target: 48-72 items/week
- Estimated completion (550 queue): 8-12 weeks under sustained velocity

## Streams

1. Creative Core A: VINX timeline, playback, export
2. Creative Core B: Imosion routing, mastering, render stability
3. Creative Core C: Prism brush/layer/smart-object upgrades
4. Creative Core D: Flux motion graph/effects/keyframe ergonomics
5. Creative Core E: Forge and AXL modeling/CAD precision upgrades
6. Accessibility Wave: T1 full app labeling + keyboard/focus hardening
7. Touch/Pen Wave: T11 pressure/tilt/gesture coverage
8. Shell & Dock Wave: T12 app-switch and shell-peek latency polish
9. Collaboration Wave: T4 project presence/comments/conflict workflow
10. UKI Wave: T5 command quality, tool routing, memory and safety
11. Perf/Reliability Wave: T6 scheduler, compositor, export correctness
12. Security/QA Wave: T7 and T8 hardening + regression automation

## Weekly Gate (Required)

Every stream must satisfy:
- tsc: zero new TypeScript errors
- stability: no increase in crash rate
- perf: no p95 regression over baseline
- accessibility: no new axe violations in touched surfaces
- release: rollback path verified for high-risk changes

## Delivery Cadence

- Monday: pull top-ranked queue items per stream from CREATIVE_500_PLUS_QUEUE.csv
- Tuesday-Thursday: implementation + tests
- Friday: merge window + release-candidate validation
- Saturday: metrics review and reprioritization

## Priority Rules

- P0 first, then P1, then P2
- Blocked items require explicit dependency ticket before carry-over
- Any item affecting export/render paths must include correctness probes

## Immediate Start Pack (Week 1)

- 24 items total (2 per stream)
- Must include at least:
  - 6 creative-core items
  - 6 accessibility/touch items
  - 4 performance/reliability items
  - 4 collaboration/UKI items
  - 4 security/QA items

## Command

Generate latest queue artifacts before each planning cycle:

`npm run backlog:build`
