# Handoff Index

This index is the single source of truth for who-is-doing-what across DEX's track-based development model. Every track has a `docs/handoff/<id>.md` file with the same shape: **Scope · Files · Done · Next · Blockers**.

Keep entries terse. Update on every PR that touches a track.

## v4.60.1 (current cumulative release)

| ID | Track | Status | Owner | Doc |
|----|-------|--------|-------|-----|
| A  | Internal Depth — Replace Stubs (security-first) | active | core | [A.md](A.md) |
| B  | Design Token Convergence | active | core | [B.md](B.md) |
| C  | Accessibility Pass | planned | core | [C.md](C.md) |
| D  | Production Hygiene | planned | core | [D.md](D.md) |
| E  | Public-Facing Refresh (README + screenshots) | planned | core | [E.md](E.md) |
| F  | GitHub 3×3 Project Board | planned | core | [F.md](F.md) |
| G  | Documentation & Handoff Hardening | active | core | [G.md](G.md) |
| H  | UKI Intelligence Expansion | planned | core | [H.md](H.md) |
| I-1 | Creative Wave 1 (Imosion + Vinx + Prism) | planned | core | [I-1.md](I-1.md) |
| J  | Desktop Workflow & Shell Modernization | planned | core | [J.md](J.md) |
| K  | Adaptive Performance Scaling | planned | core | [K.md](K.md) |
| M-1 | UI/UX Refinement Wave 1 (typography + blur + translucency + motion) | planned | core | [M-1.md](M-1.md) |
| O  | System-Wide Completion Audit | continuous | core | [O.md](O.md) |
| P  | Release & Deployment Pipeline Hardening | continuous | core | [P.md](P.md) |

## Future (post-v4.60.1)

| ID | Track | Target |
|----|-------|--------|
| I-2 | Creative Wave 2 (Flux, Forge, Polish, AXL, Canvas, PresentationBuilder, PixelArt) | v5.0 |
| L  | Native Layer Expansion (Rust compositor + wgpu + C++ SIMD) | v5.0 |
| M-2 | UI/UX Refinement Wave 2 (calm-mode, hover-cards, layout polish) | v5.0 |
| N  | Stress Testing & Reliability Engineering | v5.0 |

## Status legend
- **active** — work in progress this release
- **planned** — scoped but not started
- **continuous** — ongoing every release
- **paused** — blocked on dependency
- **done** — shipped (kept for history)

---

## Handoff doc template

Copy this when creating `docs/handoff/<id>.md`:

```markdown
# Track <ID>: <Name>

**Status:** active | planned | paused | done
**Release target:** v4.60.1
**Owner:** <name or `core`>

## Scope
One paragraph. What this track owns, what it explicitly does NOT own.

## Files
- src/path/to/primary.ts
- src/path/to/secondary.ts
- (≤10 entries; deep links if helpful)

## Done
- [x] Sub-item 1 (<commit sha or date>)
- [x] Sub-item 2

## Next
- [ ] Next sub-item — concrete action, file, expected delta
- [ ] After that — ...

## Blockers
- None / waiting on Track X / waiting on user decision <link to issue>

## Verification
What "done" looks like for this track. Tests, grep checks, manual smoke.

## Notes
Decisions, gotchas, references. Keep terse.
```
