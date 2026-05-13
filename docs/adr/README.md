# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for DEX. ADRs
capture significant architectural choices, the context that produced them,
and their consequences so future contributors can understand why the system
is shaped the way it is.

## Process

1. Copy `template.md` to `NNNN-short-title.md` where `NNNN` is the next
   four-digit number in sequence and `short-title` is a hyphenated slug.
2. Set status to `Proposed` while the decision is under discussion.
3. Once accepted, update status to `Accepted` and the date.
4. Never delete or rewrite an accepted ADR. Supersede it with a new ADR that
   references the prior one, and update the prior ADR status to
   `Superseded by NNNN`.
5. Reference ADRs from code comments and design docs whenever a non-obvious
   choice is being implemented.

## Status values

- `Proposed` - under discussion, not yet binding.
- `Accepted` - the current binding decision.
- `Superseded by NNNN` - replaced; see the referenced ADR.
- `Deprecated` - no longer in force, no replacement.

## Index

- [0001](0001-record-architecture-decisions.md) Record architecture decisions.
- [0002](0002-master-evolution-plan-phasing.md) Master Evolution Plan phasing.
- [0003](0003-improvements500-shared-primitives.md) `improvements500`
  shared-primitive layer.
- [0004](0004-ipc-contract-formalization.md) IPC contract formalization.
- [0005](0005-release-rings-and-rollback.md) Release rings and rollback
  policy.
