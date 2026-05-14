# Track G: Documentation & Handoff Hardening

**Status:** active
**Release target:** v4.60.1
**Owner:** core

## Scope
Make DEX a project that any contributor can pick up mid-flight. Establishes the per-track handoff system, ADR backlog, and `/memories/repo/` upkeep.

## Files
- docs/CONTRIBUTING.md
- docs/handoff/INDEX.md
- docs/handoff/<id>.md (one per track)
- docs/adr/ (Architecture Decision Records)

## Done
- [x] G1 — CONTRIBUTING "Pick up where someone left off" section
- [x] G2 — handoff/INDEX.md created with all v4.60.1 tracks listed and a doc template
- [x] G2 — handoff/A.md, handoff/B.md, handoff/G.md seeded
- [x] G3 — all v4.60.1 track docs (C, D, E, F, H, I-1, J, K, M-1, O, P) exist in `docs/handoff/` with Scope + Next sections
- [x] G4 — ADRs 0006-0010 seeded: design-token-shadows, idle-pause-kernel, uki-2b-embedding-model, native-rust-kernel, adaptive-scaling-tier-policy

## Next
- [ ] G5 — refresh `/memories/repo/` after release with v4.60.1 deltas (deferred to release-tag commit)

## Blockers
- None

## Verification
- Every track in INDEX.md has a corresponding `handoff/<id>.md`
- `ls docs/adr/*.md | wc -l` ≥ 5
- A new contributor can read CONTRIBUTING.md + INDEX.md + a single track doc and start within 15 min (smoke-tested by asking someone unfamiliar)

## Notes
- Keep each handoff doc ≤100 lines.
- ADRs use [adr-tools](https://github.com/npryce/adr-tools) numbering convention (`NNNN-title.md`).
