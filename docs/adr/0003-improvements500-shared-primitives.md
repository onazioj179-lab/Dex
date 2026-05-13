# 0003. `improvements500` shared-primitive layer

Date: 2026-05-13

## Status

Accepted

## Context

Across waves 1-50 we shipped 501 small shared primitives to
`src/renderer/improvements500/`, each watermarked, unit-tested, and exported
through a single barrel `src/renderer/improvements500/index.ts`. The pattern
proved valuable: tiny, well-tested utilities accumulated faster than feature
work could consume them, removing duplication when feature work eventually
landed.

The 500-improvement backlog is now closed. We need an explicit policy for
how future shared primitives are added so the layer does not stagnate or
become a dumping ground.

## Decision

The `improvements500` directory is renamed in spirit (not on disk) to the
DEX shared-primitive layer. The following rules apply going forward:

1. New primitives may be added at any time but must remain small (single
   responsibility, no app-level coupling, no DOM dependencies unless the
   module name explicitly indicates DOM use).
2. Each primitive must:
   - Carry the standard `@internal DEX module` watermark.
   - Be re-exported from the barrel.
   - Have at least one Vitest unit test under
     `tests/unit/improvements500-*.test.ts`.
   - Pass `npx tsc --noEmit -p tsconfig.json` and `npx vitest run` before
     merging.
3. Primitives must not import from feature modules. Imports flow only from
   feature modules into `improvements500`, never the reverse.
4. Naming collisions in the barrel are blocking. Run a `grep_search` for
   the exported symbol names against the barrel before adding new exports.
   Known collision-prone names are listed in
   `/memories/session/improvements500-state.md`.
5. Wave numbering continues monotonically. Waves are now thematic (mapped
   to Master Evolution Plan areas) rather than count-driven.

## Consequences

- The shared layer keeps growing as a deliberate platform investment.
- Feature work always has a place to extract reusable logic.
- The discipline around watermarks, tests, and the barrel keeps the layer
  reviewable in spite of its size.

## Alternatives Considered

- Freeze the layer at 501 modules. Rejected because new feature work will
  continue to discover reusable patterns.
- Split the barrel into per-area sub-barrels. Deferred; revisit if the
  barrel exceeds 1000 exports.
