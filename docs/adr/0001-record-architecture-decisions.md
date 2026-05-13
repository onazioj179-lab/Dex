# 0001. Record architecture decisions

Date: 2026-05-13

## Status

Accepted

## Context

DEX has reached a complexity level where significant architectural choices
need durable, discoverable rationale. The Master Evolution Plan introduces
12 phases of cross-cutting work where decisions made in one phase constrain
later phases. Without a written decision record, contributors re-litigate
settled choices and lose context behind constraints that look arbitrary.

## Decision

We will use lightweight Architecture Decision Records stored under
`docs/adr/`. Every architectural decision that meets at least one of the
following criteria must be captured in an ADR before the corresponding code
lands:

- Introduces a new shared platform layer or replaces an existing one.
- Changes a public IPC contract, plugin SDK surface, or persisted schema.
- Changes a cross-cutting policy (security, accessibility, observability,
  release rings, rollback).
- Defers or excludes a workstream from a Master Evolution Plan phase.

ADRs use the format defined in `template.md`. The current binding ADRs are
indexed in `README.md`.

## Consequences

- New contributors and future agents have a single source of truth for why
  the system looks the way it does.
- Architectural reviews shift from re-explaining context to challenging the
  decision text and the listed alternatives.
- Small additional process cost per decision. We accept this in exchange for
  long-term maintainability.

## Alternatives Considered

- Inline rationale in pull request descriptions only. Rejected because PRs
  are hard to discover months later and are not indexed by topic.
- A single design wiki. Rejected because wikis drift from the codebase and
  are not part of code review.
